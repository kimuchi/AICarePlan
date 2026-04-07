import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { findSubfolder, createSpreadsheetInFolder } from '../lib/drive.js';
import { batchUpdate, addSheet, appendSheetData } from '../lib/sheets.js';
import { buildTable1Requests, buildTable2Requests, buildTable3Requests } from '../lib/careplanFormat.js';
import type { BusinessMode, GeneratedPlan, UserInfo, PlanMeta } from '../types/plan.js';

export const exportRouter = Router();

/** POST /api/export — Export care plan to Google Spreadsheet */
exportRouter.post('/', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const {
      user,
      plan,
      meta,
      mode,
    } = req.body as {
      user: UserInfo;
      plan: GeneratedPlan;
      meta: PlanMeta;
      mode: BusinessMode;
    };

    if (!user || !plan || !mode || !meta) {
      return res.status(400).json({ error: 'user, plan, meta, and mode are required' });
    }

    // Find or use the 01_居宅サービス計画書 subfolder
    let targetFolderId = user.folderId;
    try {
      const subFolderId = await findSubfolder(token, user.folderId, '01_居宅サービス計画書');
      if (subFolderId) {
        targetFolderId = subFolderId;
      }
    } catch {
      // Use root user folder
    }

    // Create spreadsheet
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `${dateStr}_ケアプラン_${user.name}`;

    const spreadsheetId = await createSpreadsheetInFolder(token, targetFolderId, fileName);

    // ── Build Table 1 ──
    const t1 = buildTable1Requests(0, plan.table1, user, meta, mode);

    // Write Table 1 data (Sheet1 = "第1表")
    const allRequests = [
      // Rename Sheet1 to "第1表"
      {
        updateSheetProperties: {
          properties: { sheetId: 0, title: '第1表' },
          fields: 'title',
        },
      },
      ...t1.requests,
    ];

    // Write row data for Table 1
    allRequests.push({
      updateCells: {
        range: {
          sheetId: 0,
          startRowIndex: 0,
          startColumnIndex: 0,
        },
        rows: t1.rowData,
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });

    await batchUpdate(token, spreadsheetId, allRequests);

    // ── Build Table 2 ──
    const sheet2Id = await addSheet(token, spreadsheetId, '第2表');
    const t2 = buildTable2Requests(sheet2Id, plan.table2, user, meta, mode);

    const t2Requests = [
      ...t2.requests,
      {
        updateCells: {
          range: {
            sheetId: sheet2Id,
            startRowIndex: 0,
            startColumnIndex: 0,
          },
          rows: t2.rowData,
          fields: 'userEnteredValue,userEnteredFormat',
        },
      },
    ];

    await batchUpdate(token, spreadsheetId, t2Requests);

    // ── Build Table 3 ──
    const sheet3Id = await addSheet(token, spreadsheetId, '第3表');
    const t3 = buildTable3Requests(sheet3Id, plan.table3, user, meta);

    const t3Requests = [
      ...t3.requests,
      {
        updateCells: {
          range: {
            sheetId: sheet3Id,
            startRowIndex: 0,
            startColumnIndex: 0,
          },
          rows: t3.rowData,
          fields: 'userEnteredValue,userEnteredFormat',
        },
      },
    ];

    await batchUpdate(token, spreadsheetId, t3Requests);

    // Record in history
    const settingsSpreadsheetId = process.env.SETTINGS_SPREADSHEET_ID;
    if (settingsSpreadsheetId) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        await appendSheetData(token, settingsSpreadsheetId, 'history!A:E', [
          [
            req.session.user?.id || '',
            user.name,
            mode,
            url,
            new Date().toISOString(),
          ],
        ]);
      } catch {
        // History recording is non-critical
      }
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.json({ url, spreadsheetId });
  } catch (err: any) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'エクスポート中にエラーが発生しました' });
  }
});

/** POST /api/export/draft — Save draft to settings spreadsheet */
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
    if (!settingsId) {
      return res.status(400).json({ error: '設定スプレッドシートが未設定です' });
    }

    await appendSheetData(token, settingsId, 'drafts!A:E', [
      [
        req.session.user?.id || '',
        userName,
        mode,
        planJson,
        new Date().toISOString(),
      ],
    ]);

    res.json({ ok: true });
  } catch (err: any) {
    console.error('Draft save error:', err.message);
    res.status(500).json({ error: '下書き保存に失敗しました' });
  }
});
