import { Router, Request, Response } from 'express';
import { getAccessToken, requireAdmin } from '../auth.js';
import { getSheetData, setSheetData, initializeSettingsSpreadsheet } from '../lib/sheets.js';
import { v4 as uuid } from 'uuid';

export const settingsRouter = Router();

function getSettingsId(): string | undefined {
  return process.env.SETTINGS_SPREADSHEET_ID;
}

/** POST /api/settings/init — 設定スプレッドシートの初期化（ログインユーザーなら誰でも実行可能） */
settingsRouter.post('/init', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) {
      console.warn('Settings init skipped: SETTINGS_SPREADSHEET_ID not set');
      return res.status(400).json({ error: 'SETTINGS_SPREADSHEET_ID not configured' });
    }
    console.log(`Initializing settings spreadsheet: ${sid}`);
    await initializeSettingsSpreadsheet(token, sid);
    console.log('Settings spreadsheet initialized successfully');
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Settings init error:', err.message);
    res.status(500).json({ error: `設定の初期化に失敗しました: ${err.message}` });
  }
});

// ── AIモデル（.envから読み取り専用） ──

settingsRouter.get('/models', async (_req: Request, res: Response) => {
  res.json({
    generate: process.env.GEMINI_MODEL_GENERATE || 'gemini-2.5-flash-preview-05-20',
    analyze: process.env.GEMINI_MODEL_ANALYZE || 'gemini-2.0-flash',
  });
});

// ── 事業所管理（type: kyotaku / shoki） ──

settingsRouter.get('/facilities', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ facilities: [] });
    const rows = await getSheetData(sid, 'facilities!A:E', token);
    if (!rows || rows.length <= 1) return res.json({ facilities: [] });
    const facilities = rows.slice(1).filter(r => r[0]).map(row => ({
      id: row[0] || '',
      type: row[1] || 'kyotaku',
      name: row[2] || '',
      address: row[3] || '',
      managerName: row[4] || '',
    }));
    res.json({ facilities });
  } catch (err: any) {
    res.status(500).json({ error: '事業所一覧の取得に失敗しました' });
  }
});

settingsRouter.put('/facilities', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { facilities } = req.body as {
      facilities: Array<{ id?: string; type: string; name: string; address: string; managerName: string }>;
    };
    const rows = [
      ['id', 'type', 'name', 'address', 'managerName'],
      ...facilities.map(f => [f.id || uuid(), f.type || 'kyotaku', f.name, f.address, f.managerName]),
    ];
    await setSheetData(token, sid, 'facilities!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: '事業所の保存に失敗しました' });
  }
});

// ── 知識ファイル管理 ──

settingsRouter.get('/knowledge-files', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ files: [] });
    const rows = await getSheetData(sid, 'knowledgeFiles!A:F', token);
    if (!rows || rows.length <= 1) return res.json({ files: [] });
    const files = rows.slice(1).filter(r => r[0]).map(row => ({
      id: row[0] || '',
      type: row[1] || 'common',
      driveFileId: row[2] || '',
      name: row[3] || '',
      mimeType: row[4] || '',
      description: row[5] || '',
    }));
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: '知識ファイルの取得に失敗しました' });
  }
});

settingsRouter.put('/knowledge-files', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { files } = req.body as {
      files: Array<{ id?: string; type: string; driveFileId: string; name: string; mimeType: string; description: string }>;
    };
    // G列(cachedContent)を空にして保存 → キャッシュクリア
    const rows = [
      ['id', 'type', 'driveFileId', 'name', 'mimeType', 'description', 'cachedContent'],
      ...files.map(f => [f.id || uuid(), f.type || 'common', f.driveFileId, f.name, f.mimeType, f.description, '']),
    ];
    await setSheetData(token, sid, 'knowledgeFiles!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: '知識ファイルの保存に失敗しました' });
  }
});

// ── ユーザーデフォルト（利用者ごとの事業所 + 作成者名上書き） ──

settingsRouter.get('/user-defaults', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ defaults: {}, managerNameOverride: '' });
    const email = req.session.user?.email || '';
    const rows = await getSheetData(sid, 'userDefaults!A:E', token);
    if (!rows || rows.length <= 1) return res.json({ defaults: {}, managerNameOverride: '' });

    const defaults: Record<string, string> = {};
    let managerNameOverride = '';
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === email) {
        if (rows[i][1] && rows[i][2]) {
          defaults[rows[i][1]] = rows[i][2]; // clientFolderId -> facilityId
        }
        if (rows[i][3]) managerNameOverride = rows[i][3];
      }
    }
    res.json({ defaults, managerNameOverride });
  } catch (err: any) {
    res.status(500).json({ error: 'デフォルト設定の取得に失敗しました' });
  }
});

settingsRouter.put('/user-defaults', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { clientFolderId, facilityId, managerNameOverride } = req.body as {
      clientFolderId: string;
      facilityId: string;
      managerNameOverride?: string;
    };
    const email = req.session.user?.email || '';
    const rows = await getSheetData(sid, 'userDefaults!A:E', token);
    const allRows = rows || [['userEmail', 'clientFolderId', 'facilityId', 'managerNameOverride', 'updatedAt']];

    let found = false;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === email && allRows[i][1] === clientFolderId) {
        allRows[i][2] = facilityId;
        if (managerNameOverride !== undefined) allRows[i][3] = managerNameOverride;
        allRows[i][4] = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) {
      allRows.push([email, clientFolderId, facilityId, managerNameOverride || '', new Date().toISOString()]);
    }
    await setSheetData(token, sid, 'userDefaults!A1', allRows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: 'デフォルト設定の保存に失敗しました' });
  }
});

// ── General / Prompts / Allowlist / History ──

settingsRouter.get('/general', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ settings: {} });
    const rows = await getSheetData(sid, 'general!A:B', token);
    if (!rows) return res.json({ settings: {} });
    const settings: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) settings[rows[i][0]] = rows[i][1] || '';
    }
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: '設定の取得に失敗しました' });
  }
});

settingsRouter.put('/general', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { settings } = req.body as { settings: Record<string, string> };
    const rows = [['key', 'value'], ...Object.entries(settings).map(([k, v]) => [k, v])];
    await setSheetData(token, sid, 'general!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: '設定の保存に失敗しました' });
  }
});

settingsRouter.get('/prompts', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ prompts: [] });
    const rows = await getSheetData(sid, 'prompts!A:C', token);
    if (!rows || rows.length <= 1) return res.json({ prompts: [] });
    res.json({ prompts: rows.slice(1).map(row => ({ id: row[0] || '', title: row[1] || '', body: row[2] || '' })) });
  } catch (err: any) {
    res.status(500).json({ error: 'プロンプトの取得に失敗しました' });
  }
});

settingsRouter.put('/prompts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { prompts } = req.body as { prompts: Array<{ id: string; title: string; body: string }> };
    const rows = [['id', 'title', 'body'], ...prompts.map(p => [p.id, p.title, p.body])];
    await setSheetData(token, sid, 'prompts!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: 'プロンプトの保存に失敗しました' });
  }
});

settingsRouter.get('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ allowlist: [] });
    const rows = await getSheetData(sid, 'allowlist!A:C', token);
    if (!rows || rows.length <= 1) return res.json({ allowlist: [] });
    res.json({ allowlist: rows.slice(1).map(row => ({ email: row[0] || '', role: row[1] || 'user', name: row[2] || '' })) });
  } catch (err: any) {
    res.status(500).json({ error: '許可リストの取得に失敗しました' });
  }
});

settingsRouter.put('/allowlist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.status(400).json({ error: 'Not configured' });
    const { allowlist } = req.body as { allowlist: Array<{ email: string; role: string; name: string }> };
    const rows = [['email', 'role', 'name'], ...allowlist.map(a => [a.email, a.role, a.name])];
    await setSheetData(token, sid, 'allowlist!A1', rows);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: '許可リストの保存に失敗しました' });
  }
});

// ユーザー一覧（共有先候補。名前とメールのみ返す）
settingsRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ users: [] });
    const rows = await getSheetData(sid, 'allowlist!A:C', token);
    if (!rows || rows.length <= 1) return res.json({ users: [] });
    res.json({
      users: rows.slice(1)
        .filter(r => r[0])
        .map(row => ({ email: row[0] || '', name: row[2] || '', role: row[1] || 'user' })),
    });
  } catch {
    res.json({ users: [] });
  }
});

settingsRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const sid = getSettingsId();
    if (!sid) return res.json({ history: [] });
    const rows = await getSheetData(sid, 'history!A:E', token);
    if (!rows || rows.length <= 1) return res.json({ history: [] });
    res.json({
      history: rows.slice(1).map(row => ({
        userId: row[0] || '', userName: row[1] || '', mode: row[2] || '',
        exportedUrl: row[3] || '', exportedAt: row[4] || '',
      })).reverse(),
    });
  } catch (err: any) {
    res.status(500).json({ error: '履歴の取得に失敗しました' });
  }
});
