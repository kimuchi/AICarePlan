import { Router, Request, Response } from 'express';
import { getAccessToken, requireAdmin } from '../auth.js';
import { getSheetData, setSheetData, appendSheetData, initializeSettingsSpreadsheet } from '../lib/sheets.js';
import { v4 as uuid } from 'uuid';

export const settingsRouter = Router();

function getSettingsId(): string | undefined {
  return process.env.SETTINGS_SPREADSHEET_ID;
}

/** POST /api/settings/init — Initialize settings spreadsheet */
settingsRouter.post('/init', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });
    await initializeSettingsSpreadsheet(token, settingsId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Settings init error:', err.message);
    res.status(500).json({ error: '設定の初期化に失敗しました' });
  }
});

// ── AIモデル（.envから読み取り、読み取り専用） ──

/** GET /api/settings/models — 現在のAIモデル設定を返す */
settingsRouter.get('/models', async (_req: Request, res: Response) => {
  res.json({
    generate: process.env.GEMINI_MODEL_GENERATE || 'gemini-2.5-flash-preview-05-20',
    analyze: process.env.GEMINI_MODEL_ANALYZE || 'gemini-2.0-flash',
  });
});

// ── 事業所管理（管理者: CRUD、一般ユーザー: 読み取り） ──

/** GET /api/settings/facilities — 事業所一覧 */
settingsRouter.get('/facilities', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.json({ facilities: [] });

    const rows = await getSheetData(settingsId, 'facilities!A:D', token);
    if (!rows || rows.length <= 1) return res.json({ facilities: [] });

    const facilities = rows.slice(1).filter(r => r[0]).map(row => ({
      id: row[0] || '',
      name: row[1] || '',
      address: row[2] || '',
      managerName: row[3] || '',
    }));
    res.json({ facilities });
  } catch (err: any) {
    console.error('Get facilities error:', err.message);
    res.status(500).json({ error: '事業所一覧の取得に失敗しました' });
  }
});

/** PUT /api/settings/facilities — 事業所一覧を上書き保存（管理者のみ） */
settingsRouter.put('/facilities', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { facilities } = req.body as {
      facilities: Array<{ id?: string; name: string; address: string; managerName: string }>;
    };

    const rows = [
      ['id', 'name', 'address', 'managerName'],
      ...facilities.map(f => [f.id || uuid(), f.name, f.address, f.managerName]),
    ];

    await setSheetData(token, settingsId, 'facilities!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update facilities error:', err.message);
    res.status(500).json({ error: '事業所の保存に失敗しました' });
  }
});

// ── 利用者デフォルト事業所 ──

/** GET /api/settings/user-defaults — ログインユーザーのデフォルト事業所一覧 */
settingsRouter.get('/user-defaults', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.json({ defaults: {} });

    const email = req.session.user?.email || '';
    const rows = await getSheetData(settingsId, 'userDefaults!A:D', token);
    if (!rows || rows.length <= 1) return res.json({ defaults: {} });

    const defaults: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === email && rows[i][1] && rows[i][2]) {
        defaults[rows[i][1]] = rows[i][2]; // clientFolderId -> facilityId
      }
    }
    res.json({ defaults });
  } catch (err: any) {
    console.error('Get user defaults error:', err.message);
    res.status(500).json({ error: 'デフォルト設定の取得に失敗しました' });
  }
});

/** PUT /api/settings/user-defaults — 利用者ごとのデフォルト事業所を保存/更新 */
settingsRouter.put('/user-defaults', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { clientFolderId, facilityId } = req.body as {
      clientFolderId: string;
      facilityId: string;
    };
    const email = req.session.user?.email || '';

    // Read existing, update or append
    const rows = await getSheetData(settingsId, 'userDefaults!A:D', token);
    const allRows = rows || [['userEmail', 'clientFolderId', 'facilityId', 'updatedAt']];

    let found = false;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === email && allRows[i][1] === clientFolderId) {
        allRows[i][2] = facilityId;
        allRows[i][3] = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) {
      allRows.push([email, clientFolderId, facilityId, new Date().toISOString()]);
    }

    await setSheetData(token, settingsId, 'userDefaults!A1', allRows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update user defaults error:', err.message);
    res.status(500).json({ error: 'デフォルト設定の保存に失敗しました' });
  }
});

// ── General settings ──

/** GET /api/settings/general */
settingsRouter.get('/general', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.json({ settings: {} });

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

/** PUT /api/settings/general */
settingsRouter.put('/general', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { settings } = req.body as { settings: Record<string, string> };
    const rows = [['key', 'value'], ...Object.entries(settings).map(([k, v]) => [k, v])];
    await setSheetData(token, settingsId, 'general!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update settings error:', err.message);
    res.status(500).json({ error: '設定の保存に失敗しました' });
  }
});

// ── プロンプト ──

/** GET /api/settings/prompts */
settingsRouter.get('/prompts', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.json({ prompts: [] });

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

/** PUT /api/settings/prompts */
settingsRouter.put('/prompts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { prompts } = req.body as { prompts: Array<{ id: string; title: string; body: string }> };
    const rows = [['id', 'title', 'body'], ...prompts.map(p => [p.id, p.title, p.body])];
    await setSheetData(token, settingsId, 'prompts!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update prompts error:', err.message);
    res.status(500).json({ error: 'プロンプトの保存に失敗しました' });
  }
});

// ── 許可リスト ──

/** GET /api/settings/allowlist */
settingsRouter.get('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
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

/** PUT /api/settings/allowlist */
settingsRouter.put('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });

    const { allowlist } = req.body as { allowlist: Array<{ email: string; role: string; name: string }> };
    const rows = [['email', 'role', 'name'], ...allowlist.map(a => [a.email, a.role, a.name])];
    await setSheetData(token, settingsId, 'allowlist!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Update allowlist error:', err.message);
    res.status(500).json({ error: '許可リストの保存に失敗しました' });
  }
});

// ── 履歴 ──

/** GET /api/settings/history */
settingsRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const settingsId = getSettingsId();
    if (!settingsId) return res.json({ history: [] });

    const rows = await getSheetData(settingsId, 'history!A:E', token);
    if (!rows || rows.length <= 1) return res.json({ history: [] });

    const history = rows.slice(1).map(row => ({
      userId: row[0] || '',
      userName: row[1] || '',
      mode: row[2] || '',
      exportedUrl: row[3] || '',
      exportedAt: row[4] || '',
    })).reverse();
    res.json({ history });
  } catch (err: any) {
    console.error('Get history error:', err.message);
    res.status(500).json({ error: '履歴の取得に失敗しました' });
  }
});
