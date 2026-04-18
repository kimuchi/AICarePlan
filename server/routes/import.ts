import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getAccessToken } from '../auth.js';
import { parseCareplanWorkbook } from '../import/parse-careplan.js';
import { parseAssessmentWorkbook } from '../import/parse-assessment.js';
import { listUserFoldersForImport, matchUser, createUserFolderTree, findUserFolderByNameForImport } from '../import/user-match.js';
import { placeCareplanArtifacts, placeAssessmentArtifacts } from '../import/drive-place.js';

declare module 'express-session' {
  interface SessionData {
    importTemp?: Record<string, { fileName: string; buffer: string; kind: 'careplan'|'assessment_facesheet'|'unknown'; parsed?: any; expiresAt: number }>;
  }
}

export const importRouter = Router();

function detectKind(fileName: string): 'careplan'|'assessment_facesheet'|'unknown' {
  if (/ケアプラン/i.test(fileName)) return 'careplan';
  if (/アセスメント|フェイスシート/i.test(fileName)) return 'assessment_facesheet';
  return 'unknown';
}

function extractNameFromFileName(fileName: string, kind: 'careplan'|'assessment_facesheet'|'unknown'): string {
  const base = fileName.replace(/\.xlsx$/i, '');
  if (kind === 'careplan') {
    const m = base.match(/ケアプラン[_＿\-\s]*(.+)$/i);
    return (m?.[1] || '').replace(/[_＿\-]+/g, ' ').trim();
  }
  if (kind === 'assessment_facesheet') {
    const m = base.match(/(?:アセスメント[_＿\-\s]*フェイスシート|フェイスシート[_＿\-\s]*アセスメント)[_＿\-\s]*(.+)$/i);
    return (m?.[1] || '').replace(/[_＿\-]+/g, ' ').trim();
  }
  return '';
}

importRouter.post('/preview', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const files = (req.body?.files || []) as Array<{ name: string; base64: string; size: number }>;
    const total = files.reduce((a, f) => a + (f.size || 0), 0);
    if (total > 50 * 1024 * 1024) return res.status(400).json({ error: 'アップロード合計50MBを超えています' });

    const users = await listUserFoldersForImport(token);
    req.session.importTemp = req.session.importTemp || {};
    const items = [] as any[];

    for (const f of files) {
      const warnings: string[] = [];
      if ((f.size || 0) > 5 * 1024 * 1024) warnings.push('5MB超のファイルです');
      if (!f.name.toLowerCase().endsWith('.xlsx')) {
        items.push({ fileId: '', fileName: f.name, kind: 'unknown', extractedUser: {}, userMatch: { status: 'not_found', candidates: [] }, summary: {}, warnings: [...warnings, 'xlsx形式のみ対応'] });
        continue;
      }
      const kind = detectKind(f.name);
      let parsed: any = null;
      let extractedUser: any = {};
      const buffer = Buffer.from(f.base64, 'base64');
      try {
        if (kind === 'careplan') {
          parsed = await parseCareplanWorkbook(buffer);
          extractedUser = { name: parsed?.table1?.userName || '', birthDate: parsed?.table1?.birthDate?.iso, insuredNumber: parsed?.table1?.insuredNumber || '', insurerNumber: parsed?.table1?.insurerNumber || '' };
        } else if (kind === 'assessment_facesheet') {
          parsed = await parseAssessmentWorkbook(buffer);
          extractedUser = { name: parsed?.faceSheet?.name || '', kana: parsed?.faceSheet?.kana || '', birthDate: parsed?.faceSheet?.birthDate || '', insuredNumber: parsed?.faceSheet?.insuredNumber || '' };
        }
      } catch (e: any) {
        warnings.push(`解析失敗: ${e.message}`);
      }
      const fallbackName = extractNameFromFileName(f.name, kind);
      if (!extractedUser?.name && fallbackName) {
        extractedUser = { ...extractedUser, name: fallbackName };
      }

      const fileId = `tmp-${uuid()}`;
      req.session.importTemp[fileId] = { fileName: f.name, buffer: f.base64, kind, parsed, expiresAt: Date.now() + 60 * 60 * 1000 };
      const userMatch = matchUser(extractedUser, users.map(u => ({ ...u })) as any);
      const summary = kind === 'careplan' ? { sheets: parsed?.sheets || [], careLevel: parsed?.table1?.careLevel || '', createdDate: parsed?.table1?.createdDate || '', needsCount: parsed?.table2?.length || 0, monitoringCount: parsed?.monitoring?.sessions?.length || 0 } : { sheets: parsed?.sheets || [], anythingCount: parsed?.anythingBox?.length || 0 };
      items.push({ fileId, fileName: f.name, kind, extractedUser, userMatch, summary, warnings });
    }

    res.json({ items });
  } catch (err: any) {
    console.error('Import preview error:', err.message);
    res.status(500).json({ error: 'プレビュー作成に失敗しました' });
  }
});

importRouter.post('/commit', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const items = (req.body?.items || []) as Array<any>;
    const results: any[] = [];
    const createdFolderByName = new Map<string, string>();

    const normalizeName = (name: string) => (name || '').replace(/[\s\u3000]+/g, '').replace(/様$/, '');

    for (const it of items) {
      const cached = req.session.importTemp?.[it.fileId];
      if (!cached || cached.expiresAt < Date.now()) { results.push({ fileId: it.fileId, fileName: it.fileName || '', ok: false, messages: ['一時ファイルが見つかりません'] }); continue; }
      try {
        let userFolderId = it.userFolderId as string;
        let userName = (it.userName || cached.parsed?.table1?.userName || cached.parsed?.faceSheet?.name || '').trim();
        if (!userName) userName = extractNameFromFileName(cached.fileName, cached.kind);

        if (!userFolderId && it.createNewUser?.name) {
          userFolderId = (await createUserFolderTree(token, it.createNewUser.name, !!it.createNewUser.isPrivate)).folderId;
          createdFolderByName.set(normalizeName(it.createNewUser.name), userFolderId);
        }

        if (!userFolderId && it.options?.autoCreateMissing && userName) {
          const key = normalizeName(userName);
          const already = createdFolderByName.get(key);
          if (already) {
            userFolderId = already;
          } else {
            const matched = await findUserFolderByNameForImport(token, userName);
            if (matched?.folderId) {
              userFolderId = matched.folderId;
            } else {
              const created = await createUserFolderTree(token, userName, false);
              userFolderId = created.folderId;
              createdFolderByName.set(key, created.folderId);
            }
          }
        }

        if (!userFolderId) {
          results.push({ fileId: it.fileId, fileName: cached.fileName, ok: false, messages: ['利用者が未特定のため取り込みできませんでした'] });
          continue;
        }
        const buffer = Buffer.from(cached.buffer, 'base64');
        const artifacts = cached.kind === 'careplan'
          ? await placeCareplanArtifacts({ token, userFolderId, userName: userName || '利用者', originalName: cached.fileName, excelBuffer: buffer, parsed: cached.parsed, overwriteDraft: !!it?.options?.overwriteDraft, actorEmail: req.session.user?.email, forceMode: it?.options?.forceMode })
          : cached.kind === 'assessment_facesheet'
            ? await placeAssessmentArtifacts({ token, userFolderId, userName: userName || '利用者', originalName: cached.fileName, excelBuffer: buffer, parsed: cached.parsed })
            : (() => { throw new Error('未対応ファイル種別です'); })();
        results.push({ fileId: it.fileId, fileName: cached.fileName, ok: true, artifacts, messages: [] });
      } catch (e: any) {
        results.push({ fileId: it.fileId, fileName: cached.fileName, ok: false, messages: [e.message] });
      }
    }
    res.json({ results });
  } catch (err: any) {
    console.error('Import commit error:', err.message);
    res.status(500).json({ error: '取り込みに失敗しました' });
  }
});
