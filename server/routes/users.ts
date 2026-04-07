import { Router, Request, Response } from 'express';
import { listSubfolders, findSubfolder, findMyDriveFolder } from '../lib/drive.js';
import { getAccessToken } from '../auth.js';
import { getSheetData } from '../lib/sheets.js';

export const usersRouter = Router();

/** GET /api/users — List users from Drive folder root */
usersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No access token' });
    }

    // Get root folder ID from settings or env
    let rootFolderId = process.env.USER_ROOT_FOLDER_ID || '';
    let privateFolderName = process.env.PRIVATE_FOLDER_NAME || '';

    // Try to read from settings spreadsheet
    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (settingsId) {
      try {
        const rows = await getSheetData(settingsId, 'general!A:B', token);
        if (rows) {
          for (const row of rows) {
            if (row[0] === 'userRootFolderId' && row[1]) rootFolderId = row[1];
            if (row[0] === 'privateFolderName' && row[1]) privateFolderName = row[1];
          }
        }
      } catch {
        // Use env vars as fallback
      }
    }

    if (!rootFolderId) {
      return res.status(400).json({ error: '利用者フォルダルートIDが設定されていません' });
    }

    // List user folders (format: {氏名}様)
    const folders = await listSubfolders(token, rootFolderId);

    // マイドライブ直下から機密フォルダルートを検索
    // Autofiler-CarePlanning仕様: マイドライブ直下 → {privateFolderName}/ → {氏名}様/ → ...
    // ユーザー本人のマイドライブ 'root' を使うため、他人のマイドライブは絶対に参照されない
    let privateRootId: string | null = null;
    if (privateFolderName) {
      try {
        privateRootId = await findMyDriveFolder(token, privateFolderName);
      } catch {
        // マイドライブにフォルダが無い場合は機密文書なし（正常）
      }
    }

    // Check for private (confidential) folders
    const users = await Promise.all(
      folders.map(async (f) => {
        let hasConfidential = false;
        if (privateRootId) {
          try {
            // マイドライブ側に同名のサブフォルダがあるか確認
            const privateFolderId = await findSubfolder(token, privateRootId, f.name);
            hasConfidential = !!privateFolderId;
          } catch {
            // Private folder check is optional
          }
        }

        // Extract name from folder name (remove 様 suffix)
        const name = f.name.replace(/様$/, '').trim();

        return {
          id: f.id,
          name,
          folderName: f.name,
          folderId: f.id,
          hasConfidential,
          modifiedTime: f.modifiedTime,
        };
      })
    );

    res.json({ users });
  } catch (err: any) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: '利用者一覧の取得に失敗しました' });
  }
});
