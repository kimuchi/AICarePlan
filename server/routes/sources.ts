import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import {
  listFilesRecursive,
  findSubfolder,
  getJsonFileContent,
  getFileContentBase64,
  getDocContent,
  getSpreadsheetStarTab,
} from '../lib/drive.js';
import { getSheetData } from '../lib/sheets.js';
import { analyzePdf, summarizeDocument } from '../lib/gemini.js';
import type { SourceFile, SourceCategory } from '../types/plan.js';

export const sourcesRouter = Router();

/** Map folder name to source category */
function categorizeByFolder(folderName: string): { category: SourceCategory; icon: string } {
  if (folderName.includes('01_居宅サービス計画書')) return { category: 'careplan', icon: '📋' };
  if (folderName.includes('02_主治医意見書')) return { category: 'medical', icon: '🏥' };
  if (folderName.includes('03_認定調査票')) return { category: 'assessment_survey', icon: '📊' };
  if (folderName.includes('04_サービス担当者会議')) return { category: 'meeting', icon: '👥' };
  if (folderName.includes('05_アセスメントシート')) return { category: 'assessment', icon: '📝' };
  if (folderName.includes('99_実施記録')) return { category: 'record', icon: '📒' };
  if (folderName.includes('フェイスシート_アセスメント')) return { category: 'facesheet', icon: '🗂' };
  return { category: 'record', icon: '📄' };
}

/** GET /api/users/:folderId/sources — List information sources for a user */
sourcesRouter.get('/users/:folderId/sources', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const folderId = req.params.folderId as string;

    // List all files recursively from user folder
    const files = await listFilesRecursive(token, folderId);

    // Also check for facesheet spreadsheet at root level
    const sources: SourceFile[] = [];

    for (const f of files) {
      const { category, icon } = categorizeByFolder(f.parentName);
      sources.push({
        id: f.id,
        name: f.name,
        category,
        date: f.modifiedTime.split('T')[0],
        mimeType: f.mimeType,
        icon,
        isConfidential: false,
        folderId,
      });
    }

    // Check private (confidential) folder
    let privateRootId = process.env.USER_ROOT_FOLDER_ID_PRIVATE || '';
    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (settingsId) {
      try {
        const rows = await getSheetData(settingsId, 'general!A:B', token);
        if (rows) {
          for (const row of rows) {
            if (row[0] === 'userRootFolderIdPrivate' && row[1]) privateRootId = row[1];
          }
        }
      } catch {
        // Ignore
      }
    }

    if (privateRootId) {
      try {
        // Find matching private folder by folder name
        // We need the folder name, get it from the shared folder
        const parentFolders = await listFilesRecursive(token, folderId);
        // This is a simplified approach - just search private root
        const privateFiles = await listFilesRecursive(token, privateRootId).catch(() => []);
        for (const pf of privateFiles) {
          const { category, icon } = categorizeByFolder(pf.parentName);
          sources.push({
            id: pf.id,
            name: pf.name,
            category,
            date: pf.modifiedTime.split('T')[0],
            mimeType: pf.mimeType,
            icon: '🔒',
            isConfidential: true,
            folderId: privateRootId,
          });
        }
      } catch {
        // Private folder access is optional
      }
    }

    // Sort: JSONs first, then by date descending
    sources.sort((a, b) => {
      // JSON files first
      const aJson = a.name.endsWith('.json') ? 0 : 1;
      const bJson = b.name.endsWith('.json') ? 0 : 1;
      if (aJson !== bJson) return aJson - bJson;
      return b.date.localeCompare(a.date);
    });

    res.json({ sources });
  } catch (err: any) {
    console.error('Error listing sources:', err.message);
    res.status(500).json({ error: '情報源の取得に失敗しました' });
  }
});

/** POST /api/sources/fetch — Fetch content from selected source files */
sourcesRouter.post('/fetch', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const { fileIds, mimeTypes } = req.body as {
      fileIds: string[];
      mimeTypes: Record<string, string>;
    };

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'fileIds array required' });
    }

    const contents: Record<string, { type: string; content: string }> = {};

    const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';

    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const mime = mimeTypes?.[fileId] || '';

          if (mime === 'application/json' || (mime === '' && fileId.endsWith('.json'))) {
            // JSON file — return as-is
            const json = await getJsonFileContent(token, fileId);
            contents[fileId] = { type: 'json', content: JSON.stringify(json, null, 2) };

          } else if (mime === 'application/pdf') {
            // PDF — analyze with Gemini
            const base64 = await getFileContentBase64(token, fileId);
            const analyzed = await analyzePdf(geminiModel, base64, mime, '文書');
            contents[fileId] = { type: 'analyzed', content: analyzed };

          } else if (mime === 'application/vnd.google-apps.document') {
            // Google Docs — export as text
            const text = await getDocContent(token, fileId);
            // Summarize if too long
            if (text.length > 20000) {
              const summary = await summarizeDocument(geminiModel, text, '文書');
              contents[fileId] = { type: 'summarized', content: summary };
            } else {
              contents[fileId] = { type: 'text', content: text };
            }

          } else if (mime === 'application/vnd.google-apps.spreadsheet') {
            // Google Sheets — get latest ★ tab
            const tabData = await getSpreadsheetStarTab(token, fileId);
            if (tabData) {
              contents[fileId] = {
                type: 'spreadsheet',
                content: JSON.stringify({ tab: tabData.tabName, data: tabData.data }),
              };
            } else {
              contents[fileId] = { type: 'empty', content: 'スプレッドシートに★タブがありません' };
            }

          } else {
            // Other — try to get as base64
            const base64 = await getFileContentBase64(token, fileId);
            contents[fileId] = { type: 'base64', content: base64 };
          }
        } catch (err: any) {
          contents[fileId] = { type: 'error', content: `取得エラー: ${err.message}` };
        }
      })
    );

    res.json({ contents });
  } catch (err: any) {
    console.error('Error fetching sources:', err.message);
    res.status(500).json({ error: '情報源コンテンツの取得に失敗しました' });
  }
});
