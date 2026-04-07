import { Router, Request, Response } from 'express';
import { getAccessToken, requireAdmin } from '../auth.js';
import { getSheetData, setSheetData, initializeSettingsSpreadsheet } from '../lib/sheets.js';

export const settingsRouter = Router();

/** POST /api/settings/init — Initialize settings spreadsheet */
settingsRouter.post('/init', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });
    }

    await initializeSettingsSpreadsheet(token, settingsId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Settings init error:', err.message);
    res.status(500).json({ error: '設定の初期化に失敗しました' });
  }
});

/** GET /api/settings/general — Get general settings */
settingsRouter.get('/general', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      return res.json({ settings: {} });
    }

    const rows = await getSheetData(settingsId, 'general!A:B', token);
    if (!rows) return res.json({ settings: {} });

    const settings: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) settings[rows[i][0]] = rows[i][1] || '';
    }

    res.json({ settings });
  } catch (err: any) {
    console.error('Get settings error:', err.message);
    res.status(500).json({ error: '設定の取得に失敗しました' });
  }
});

/** PUT /api/settings/general — Update general settings */
settingsRouter.put('/general', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });
    }

    const { settings } = req.body as { settings: Record<string, string> };
    const rows = [
      ['key', 'value'],
      ...Object.entries(settings).map(([k, v]) => [k, v]),
    ];

    await setSheetData(token, settingsId, 'general!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update settings error:', err.message);
    res.status(500).json({ error: '設定の保存に失敗しました' });
  }
});

/** GET /api/settings/prompts — Get all prompts */
settingsRouter.get('/prompts', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      return res.json({ prompts: [] });
    }

    const rows = await getSheetData(settingsId, 'prompts!A:C', token);
    if (!rows || rows.length <= 1) return res.json({ prompts: [] });

    const prompts = rows.slice(1).map(row => ({
      id: row[0] || '',
      title: row[1] || '',
      body: row[2] || '',
    }));

    res.json({ prompts });
  } catch (err: any) {
    console.error('Get prompts error:', err.message);
    res.status(500).json({ error: 'プロンプトの取得に失敗しました' });
  }
});

/** PUT /api/settings/prompts — Update prompts */
settingsRouter.put('/prompts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });
    }

    const { prompts } = req.body as { prompts: Array<{ id: string; title: string; body: string }> };
    const rows = [
      ['id', 'title', 'body'],
      ...prompts.map(p => [p.id, p.title, p.body]),
    ];

    await setSheetData(token, settingsId, 'prompts!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update prompts error:', err.message);
    res.status(500).json({ error: 'プロンプトの保存に失敗しました' });
  }
});

/** GET /api/settings/allowlist — Get allowlist */
settingsRouter.get('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) return res.json({ allowlist: [] });

    const rows = await getSheetData(settingsId, 'allowlist!A:C', token);
    if (!rows || rows.length <= 1) return res.json({ allowlist: [] });

    const allowlist = rows.slice(1).map(row => ({
      email: row[0] || '',
      role: row[1] || 'user',
      name: row[2] || '',
    }));

    res.json({ allowlist });
  } catch (err: any) {
    console.error('Get allowlist error:', err.message);
    res.status(500).json({ error: '許可リストの取得に失敗しました' });
  }
});

/** PUT /api/settings/allowlist — Update allowlist */
settingsRouter.put('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { allowlist } = req.body as { allowlist: Array<{ email: string; role: string; name: string }> };
    const rows = [
      ['email', 'role', 'name'],
      ...allowlist.map(a => [a.email, a.role, a.name]),
    ];

    await setSheetData(token, settingsId, 'allowlist!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update allowlist error:', err.message);
    res.status(500).json({ error: '許可リストの保存に失敗しました' });
  }
});

/** GET /api/settings/history — Get export history */
settingsRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) return res.json({ history: [] });

    const rows = await getSheetData(settingsId, 'history!A:E', token);
    if (!rows || rows.length <= 1) return res.json({ history: [] });

    const history = rows.slice(1).map(row => ({
      userId: row[0] || '',
      userName: row[1] || '',
      mode: row[2] || '',
      exportedUrl: row[3] || '',
      exportedAt: row[4] || '',
    })).reverse(); // Latest first

    res.json({ history });
  } catch (err: any) {
    console.error('Get history error:', err.message);
    res.status(500).json({ error: '履歴の取得に失敗しました' });
  }
});
