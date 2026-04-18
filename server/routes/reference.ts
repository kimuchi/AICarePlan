import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { listFilesInFolder, findSubfolder, getJsonFileContent } from '../lib/drive.js';

export const referenceRouter = Router();

async function latestJson(token: string, folderId: string, nameInclude: RegExp) {
  const files = await listFilesInFolder(token, folderId);
  const target = files.filter(f => f.name.endsWith('.json') && nameInclude.test(f.name)).sort((a,b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))[0];
  if (!target) return null;
  const data = await getJsonFileContent(token, target.id);
  return { source: { fileId: target.id, fileName: target.name, modifiedTime: target.modifiedTime }, data };
}

referenceRouter.get('/users/:folderId/careplan-latest', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const base = String(req.params.folderId || "");
    const cpFolder = await findSubfolder(token, base, '01_居宅サービス計画書');
    if (!cpFolder) return res.json({ found: false });
    const latest = await latestJson(token, cpFolder, /解析結果.*ケアプラン|careplan/i);
    if (!latest) return res.json({ found: false });
    res.json({ found: true, ...latest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

referenceRouter.get('/users/:folderId/assessment-latest', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const base = String(req.params.folderId || "");
    const asFolder = await findSubfolder(token, base, '05_アセスメントシート');
    if (!asFolder) return res.json({ found: false });
    const latest = await latestJson(token, asFolder, /解析結果.*アセスメント|assessment/i);
    if (!latest) return res.json({ found: false });
    res.json({ found: true, source: { kind: 'json', ...latest.source }, data: latest.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
