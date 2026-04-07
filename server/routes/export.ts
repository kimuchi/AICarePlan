import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { findSubfolder, createSpreadsheetInFolder, listFilesInFolder } from '../lib/drive.js';
import { batchUpdate, addSheet, appendSheetData } from '../lib/sheets.js';
import { buildTable1Requests, buildTable2Requests, buildTable3Requests } from '../lib/careplanFormat.js';
import type { BusinessMode, GeneratedPlan, UserInfo, PlanMeta } from '../types/plan.js';

export const exportRouter = Router();

/** POST /api/export — Export care plan to Google Spreadsheet */
exportRouter.post('/', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const { user, plan, meta, mode } = req.body as {
      user: UserInfo;
      plan: GeneratedPlan;
      meta: PlanMeta;
      mode: BusinessMode;
    };

    if (!user || !plan || !mode || !meta) {
      return res.status(400).json({ error: 'user, plan, meta, and mode are required' });
    }

    // 01_居宅サービス計画書 サブフォルダを探す
    let targetFolderId = user.folderId;
    try {
      const subFolderId = await findSubfolder(token, user.folderId, '01_居宅サービス計画書');
      if (subFolderId) {
        targetFolderId = subFolderId;
      }
    } catch {
      // Use root user folder
    }

    // ファイル名の重複チェック（既存ファイルがあれば(1), (2)...を付ける）
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const baseName = `${dateStr}_ケアプラン_${user.name}`;

    let fileName = baseName;
    try {
      const existingFiles = await listFilesInFolder(token, targetFolderId);
      const existingNames = new Set(existingFiles.map(f => f.name));
      let counter = 0;
      while (existingNames.has(fileName)) {
        counter++;
        fileName = `${baseName}(${counter})`;
      }
    } catch {
      // If listing fails, just use the base name
    }

    const spreadsheetId = await createSpreadsheetInFolder(token, targetFolderId, fileName);

    // シートタイトル
    const t1Title = mode === 'shoki'
      ? '居宅サービス計画書（1） 兼小規模多機能型居宅介護計画書'
      : '居宅サービス計画書（1）';
    const t2Title = mode === 'shoki'
      ? '居宅サービス計画書（2） 兼小規模多機能型居宅介護計画書'
      : '居宅サービス計画書（2）';
    const t3Title = '週間サービス計画表';

    // ── Build Table 1 ──
    const t1 = buildTable1Requests(0, plan.table1, user, meta, mode);

    const allRequests = [
      {
        updateSheetProperties: {
          properties: { sheetId: 0, title: t1Title },
          fields: 'title',
        },
      },
      ...t1.requests,
      {
        updateCells: {
          range: { sheetId: 0, startRowIndex: 0, startColumnIndex: 0 },
          rows: t1.rowData,
          fields: 'userEnteredValue,userEnteredFormat',
        },
      },
    ];
    await batchUpdate(token, spreadsheetId, allRequests);

    // ── Build Table 2 ──
    const sheet2Id = await addSheet(token, spreadsheetId, t2Title);
    const t2 = buildTable2Requests(sheet2Id, plan.table2, user, meta, mode);
    await batchUpdate(token, spreadsheetId, [
      ...t2.requests,
      {
        updateCells: {
          range: { sheetId: sheet2Id, startRowIndex: 0, startColumnIndex: 0 },
          rows: t2.rowData,
          fields: 'userEnteredValue,userEnteredFormat',
        },
      },
    ]);

    // ── Build Table 3 ──
    const sheet3Id = await addSheet(token, spreadsheetId, t3Title);
    const t3 = buildTable3Requests(sheet3Id, plan.table3, user, meta);
    await batchUpdate(token, spreadsheetId, [
      ...t3.requests,
      {
        updateCells: {
          range: { sheetId: sheet3Id, startRowIndex: 0, startColumnIndex: 0 },
          rows: t3.rowData,
          fields: 'userEnteredValue,userEnteredFormat',
        },
      },
    ]);

    // Record in history
    const settingsSpreadsheetId = process.env.SETTINGS_SPREADSHEET_ID;
    if (settingsSpreadsheetId) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        await appendSheetData(token, settingsSpreadsheetId, 'history!A:E', [
          [req.session.user?.id || '', user.name, mode, url, new Date().toISOString()],
        ]);
      } catch { /* non-critical */ }
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.json({ url, spreadsheetId });
  } catch (err: any) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'エクスポート中にエラーが発生しました' });
  }
});

/** POST /api/export/draft */
exportRouter.post('/draft', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const { userName, planJson, mode } = req.body as {
      userName: string;
      planJson: string;
      mode: BusinessMode;
    };

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) return res.status(400).json({ error: '設定スプレッドシートが未設定です' });

    await appendSheetData(token, settingsId, 'drafts!A:E', [
      [req.session.user?.id || '', userName, mode, planJson, new Date().toISOString()],
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Draft save error:', err.message);
    res.status(500).json({ error: '下書き保存に失敗しました' });
  }
});
