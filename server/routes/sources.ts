import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import {
  listFilesRecursive,
  findSubfolder,
  findMyDriveFolder,
  getJsonFileContent,
  getFileContentBase64,
  getDocContent,
  getSpreadsheetStarTab,
  listSubfolders,
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

/**
 * マイドライブ側から機密文書を検索する共通ヘルパー。
 * Autofiler-CarePlanning仕様に準拠:
 *   マイドライブ直下 → {privateFolderName}/ → {氏名}様/ → 01_... 02_... と同じ構成
 */
async function findPrivateUserFolder(
  token: string,
  userFolderName: string,
): Promise<string | null> {
  let privateFolderName = process.env.PRIVATE_FOLDER_NAME || '';

  // 設定スプレッドシートから読み取り
  const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
  if (settingsId) {
    try {
      const rows = await getSheetData(settingsId, 'general!A:B', token);
      if (rows) {
        for (const row of rows) {
          if (row[0] === 'privateFolderName' && row[1]) privateFolderName = row[1];
        }
      }
    } catch { /* ignore */ }
  }

  if (!privateFolderName) return null;

  // マイドライブ直下から機密フォルダルートを検索
  const privateRootId = await findMyDriveFolder(token, privateFolderName);
  if (!privateRootId) return null;

  // その中から同名の利用者フォルダを検索
  return findSubfolder(token, privateRootId, userFolderName);
}

/** GET /api/sources/users/:folderId/sources — List information sources for a user */
sourcesRouter.get('/users/:folderId/sources', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const folderId = req.params.folderId as string;

    // List all files recursively from shared user folder
    const files = await listFilesRecursive(token, folderId);

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

    // マイドライブ側の機密文書を検索
    // 共有フォルダ名（{氏名}様）を取得するため、共有フォルダのメタ情報が必要
    // folderId からフォルダ名を取得する代わりに、query param で受け取る
    const userFolderName = (req.query.folderName as string) || '';
    if (userFolderName) {
      try {
        const privateFolderId = await findPrivateUserFolder(token, userFolderName);
        if (privateFolderId) {
          const privateFiles = await listFilesRecursive(token, privateFolderId);
          for (const pf of privateFiles) {
            const { category } = categorizeByFolder(pf.parentName);
            sources.push({
              id: pf.id,
              name: pf.name,
              category,
              date: pf.modifiedTime.split('T')[0],
              mimeType: pf.mimeType,
              icon: '🔒',
              isConfidential: true,
              folderId: privateFolderId,
            });
          }
        }
      } catch {
        // マイドライブに機密フォルダが無い場合はスキップ（正常）
      }
    }

    // Sort: JSONs first, then by date descending
    sources.sort((a, b) => {
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

    // 解析用モデル（PDF解析・要約向け。高速・低コスト推奨）
    const analyzeModel = process.env.GEMINI_MODEL_ANALYZE || 'gemini-2.0-flash';

    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const mime = mimeTypes?.[fileId] || '';

          if (mime === 'application/json' || (mime === '' && fileId.endsWith('.json'))) {
            // JSON file — return as-is
            const json = await getJsonFileContent(token, fileId);
            contents[fileId] = { type: 'json', content: JSON.stringify(json, null, 2) };

          } else if (mime === 'application/pdf') {
            // PDF — analyze with Gemini (解析用モデル)
            const base64 = await getFileContentBase64(token, fileId);
            const analyzed = await analyzePdf(analyzeModel, base64, mime, '文書');
            contents[fileId] = { type: 'analyzed', content: analyzed };

          } else if (mime === 'application/vnd.google-apps.document') {
            // Google Docs — export as text
            const text = await getDocContent(token, fileId);
            // Summarize if too long (解析用モデル)
            if (text.length > 20000) {
              const summary = await summarizeDocument(analyzeModel, text, '文書');
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
