import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { getSheetData, setSheetData, appendSheetData } from '../lib/sheets.js';
import { getFileContentBase64, getJsonFileContent, getDocContent } from '../lib/drive.js';
import { extractExistingPlan } from '../lib/gemini.js';
import { v4 as uuid } from 'uuid';

export const plansRouter = Router();

function getSettingsId(): string | undefined {
  return process.env.SETTINGS_SPREADSHEET_ID;
}

// ── プラン保存（下書き or 完成） ──

plansRouter.post('/save', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });

    const { planId, clientFolderId, clientName, mode, status, planJson } = req.body as {
      planId?: string;
      clientFolderId: string;
      clientName: string;
      mode: string;
      status: 'draft' | 'completed';
      planJson: string;
    };

    const email = req.session.user?.email || '';
    const authorName = req.session.user?.name || '';
    const id = planId || uuid();
    const now = new Date().toISOString();

    // Read existing drafts
    const rows = await getSheetData(sid, 'drafts!A:J', token);
    const allRows = rows || [['planId', 'clientFolderId', 'clientName', 'authorEmail', 'authorName', 'mode', 'status', 'plan_json', 'sharedWith', 'updatedAt']];

    // Update existing or append
    let found = false;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === id) {
        allRows[i][5] = mode;
        allRows[i][6] = status;
        allRows[i][7] = planJson;
        allRows[i][9] = now;
        found = true;
        break;
      }
    }
    if (!found) {
      allRows.push([id, clientFolderId, clientName, email, authorName, mode, status, planJson, '', now]);
    }

    await setSheetData(token, sid, 'drafts!A1', allRows);
    res.json({ ok: true, planId: id });
  } catch (err: any) {
    console.error('Plan save error:', err.message);
    res.status(500).json({ error: 'プランの保存に失敗しました' });
  }
});

// ── 自分に関連するプラン全件（作成 + 共有） ──

plansRouter.get('/my', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ plans: [] });

    const email = req.session.user?.email || '';
    const rows = await getSheetData(sid, 'drafts!A:J', token);
    if (!rows || rows.length <= 1) return res.json({ plans: [] });

    const plans = rows.slice(1)
      .filter(row => {
        const isAuthor = row[3] === email;
        const sharedWith = (row[8] || '').split(',').map((s: string) => s.trim().toLowerCase());
        const isShared = sharedWith.includes(email.toLowerCase()) || sharedWith.includes('*');
        return isAuthor || isShared;
      })
      .map(row => ({
        planId: row[0] || '',
        clientFolderId: row[1] || '',
        clientName: row[2] || '',
        authorEmail: row[3] || '',
        authorName: row[4] || '',
        mode: row[5] || '',
        status: row[6] || 'draft',
        sharedWith: row[8] || '',
        updatedAt: row[9] || '',
        isSharedToMe: row[3] !== email,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.json({ plans });
  } catch (err: any) {
    console.error('My plans error:', err.message);
    res.status(500).json({ error: 'プラン一覧の取得に失敗しました' });
  }
});

// ── 利用者のプラン一覧 ──

plansRouter.get('/list/:clientFolderId', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ plans: [] });

    const clientFolderId = req.params.clientFolderId as string;
    const email = req.session.user?.email || '';

    const rows = await getSheetData(sid, 'drafts!A:J', token);
    if (!rows || rows.length <= 1) return res.json({ plans: [] });

    const plans = rows.slice(1)
      .filter(row => {
        if (row[1] !== clientFolderId) return false;
        // 自分が作成 or 自分に共有されている
        const isAuthor = row[3] === email;
        const sharedWith = (row[8] || '').split(',').map((s: string) => s.trim().toLowerCase());
        const isShared = sharedWith.includes(email.toLowerCase()) || sharedWith.includes('*');
        return isAuthor || isShared;
      })
      .map(row => ({
        planId: row[0] || '',
        clientFolderId: row[1] || '',
        clientName: row[2] || '',
        authorEmail: row[3] || '',
        authorName: row[4] || '',
        mode: row[5] || '',
        status: row[6] || 'draft',
        updatedAt: row[9] || '',
        // plan_json は一覧では返さない（大きいので）
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.json({ plans });
  } catch (err: any) {
    console.error('Plan list error:', err.message);
    res.status(500).json({ error: 'プラン一覧の取得に失敗しました' });
  }
});

// ── プラン読み込み ──

plansRouter.get('/load/:planId', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });

    const planId = req.params.planId as string;
    const email = req.session.user?.email || '';

    const rows = await getSheetData(sid, 'drafts!A:J', token);
    if (!rows) return res.status(404).json({ error: 'プランが見つかりません' });

    const row = rows.find(r => r[0] === planId);
    if (!row) return res.status(404).json({ error: 'プランが見つかりません' });

    // 権限チェック
    const isAuthor = row[3] === email;
    const sharedWith = (row[8] || '').split(',').map((s: string) => s.trim().toLowerCase());
    const isShared = sharedWith.includes(email.toLowerCase()) || sharedWith.includes('*');
    if (!isAuthor && !isShared) {
      return res.status(403).json({ error: 'このプランへのアクセス権がありません' });
    }

    let planData = null;
    try { planData = JSON.parse(row[7] || '{}'); } catch { /* invalid json */ }

    res.json({
      planId: row[0],
      clientFolderId: row[1],
      clientName: row[2],
      authorEmail: row[3],
      authorName: row[4],
      mode: row[5],
      status: row[6],
      plan: planData,
      sharedWith: row[8] || '',
      updatedAt: row[9],
    });
  } catch (err: any) {
    console.error('Plan load error:', err.message);
    res.status(500).json({ error: 'プランの読み込みに失敗しました' });
  }
});

// ── プラン共有 ──

plansRouter.put('/share/:planId', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });

    const planId = req.params.planId as string;
    const { sharedWith } = req.body as { sharedWith: string }; // カンマ区切りのメール or "*"
    const email = req.session.user?.email || '';

    const rows = await getSheetData(sid, 'drafts!A:J', token);
    if (!rows) return res.status(404).json({ error: 'プランが見つかりません' });

    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === planId) {
        if (rows[i][3] !== email) {
          return res.status(403).json({ error: '共有設定は作成者のみ変更できます' });
        }
        rows[i][8] = sharedWith;
        rows[i][9] = new Date().toISOString();
        found = true;
        break;
      }
    }

    if (!found) return res.status(404).json({ error: 'プランが見つかりません' });
    await setSheetData(token, sid, 'drafts!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Plan share error:', err.message);
    res.status(500).json({ error: '共有設定の変更に失敗しました' });
  }
});

// ── プラン削除 ──

plansRouter.delete('/:planId', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });

    const planId = req.params.planId as string;
    const email = req.session.user?.email || '';

    const rows = await getSheetData(sid, 'drafts!A:J', token);
    if (!rows) return res.status(404).json({ error: 'Not found' });

    const filtered = rows.filter((row, i) => i === 0 || row[0] !== planId || row[3] !== email);
    await setSheetData(token, sid, 'drafts!A1', filtered);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Plan delete error:', err.message);
    res.status(500).json({ error: 'プランの削除に失敗しました' });
  }
});

// ── 既存ケアプランの構造化読み込み ──

plansRouter.post('/extract-existing', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const { fileId, mimeType } = req.body as { fileId: string; mimeType: string };
    const analyzeModel = process.env.GEMINI_MODEL_ANALYZE || 'gemini-2.0-flash';

    let result: any = null;

    if (mimeType === 'application/json') {
      // JSON: パースして構造化
      const json = await getJsonFileContent(token, fileId);
      // Autofiler JSON構造を直接使うか、Geminiで再構造化
      const docs = json.documents || json;
      if (docs.table_1 || docs.table1 || docs.table_2 || docs.table2) {
        // 既にAutofilerで構造化済み → Geminiで正規化
        const content = JSON.stringify(json, null, 2);
        result = await extractExistingPlan(analyzeModel, content);
      } else {
        // 構造が不明 → Geminiで解析
        const content = JSON.stringify(json, null, 2);
        result = await extractExistingPlan(analyzeModel, content);
      }
    } else if (mimeType === 'application/pdf') {
      // PDF: Geminiで構造化抽出（専用プロンプト）
      const base64 = await getFileContentBase64(token, fileId);
      result = await extractExistingPlan(analyzeModel, '', true, base64, mimeType);
    } else if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs
      const text = await getDocContent(token, fileId);
      result = await extractExistingPlan(analyzeModel, text);
    }

    if (!result) {
      return res.status(400).json({ error: '既存プランの読み取りに失敗しました' });
    }

    res.json({ existingPlan: result });
  } catch (err: any) {
    console.error('Extract existing plan error:', err.message);
    res.status(500).json({ error: '既存プランの読み取り中にエラーが発生しました' });
  }
});
