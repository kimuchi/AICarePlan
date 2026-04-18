import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { google } from 'googleapis';
import { getAccessToken } from '../auth.js';
import { parseCareplanWorkbook } from '../import/parse-careplan.js';
import { parseAssessmentWorkbook } from '../import/parse-assessment.js';
import { listUserFoldersForImport, matchUser, createUserFolderTree, findUserFolderByNameForImport } from '../import/user-match.js';
import { placeCareplanArtifacts, placeAssessmentArtifacts } from '../import/drive-place.js';
import { findSubfolder, listFilesInFolder } from '../lib/drive.js';

declare module 'express-session' {
  interface SessionData {
    importTemp?: Record<string, { fileName: string; buffer: string; kind: 'careplan'|'assessment_facesheet'|'unknown'; parsed?: any; expiresAt: number }>;
  }
}

export const importRouter = Router();
const BULK_FAST_MODE_THRESHOLD = 10;
const COMMIT_CONCURRENCY = 3;

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
    const cleanOld = !!req.body?.cleanOld;
    const results: any[] = Array.from({ length: items.length }, () => ({}));
    const createdFolderByName = new Map<string, string>();
    const existingUsers = await listUserFoldersForImport(token);
    const bulkFastMode = items.length >= BULK_FAST_MODE_THRESHOLD;
    const committedFolderIds = new Set<string>();

    const normalizeName = (name: string) => (name || '').replace(/[\s\u3000]+/g, '').replace(/様$/, '');

    const processItem = async (it: any, index: number) => {
      const cached = req.session.importTemp?.[it.fileId];
      const fallbackName = it.fileName || cached?.fileName || '';
      if (!cached || cached.expiresAt < Date.now()) { results[index] = { fileId: it.fileId, fileName: fallbackName, ok: false, messages: ['一時ファイルが見つかりません'] }; return; }
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
            const matched = existingUsers.find(u => normalizeName(u.folderName) === key);
            if (matched) {
              userFolderId = matched.folderId;
            } else {
              const created = await createUserFolderTree(token, userName, false);
              userFolderId = created.folderId;
              createdFolderByName.set(key, created.folderId);
            }
          }
        }

        if (!userFolderId) throw new Error('利用者が未特定です');
        const buffer = Buffer.from(cached.buffer, 'base64');
        const artifacts = cached.kind === 'careplan'
          ? await placeCareplanArtifacts({ token, userFolderId, userName: userName || '利用者', originalName: cached.fileName, excelBuffer: buffer, parsed: cached.parsed, overwriteDraft: !!it?.options?.overwriteDraft, actorEmail: req.session.user?.email, skipSheetConversion: bulkFastMode, forceMode: it?.options?.forceMode })
          : cached.kind === 'assessment_facesheet'
            ? await placeAssessmentArtifacts({ token, userFolderId, userName: userName || '利用者', originalName: cached.fileName, excelBuffer: buffer, parsed: cached.parsed, skipSheetConversion: bulkFastMode })
            : (() => { throw new Error('未対応ファイル種別です'); })();
        committedFolderIds.add(userFolderId);
        results[index] = { fileId: it.fileId, fileName: cached.fileName, ok: true, artifacts, messages: artifacts?.messages || [] };
      } catch (e: any) {
        results[index] = { fileId: it.fileId, fileName: cached?.fileName || fallbackName, ok: false, messages: [e.message] };
      }
    };

    for (let i = 0; i < items.length; i += COMMIT_CONCURRENCY) {
      const batch = items.slice(i, i + COMMIT_CONCURRENCY);
      await Promise.all(batch.map((it, idx) => processItem(it, i + idx)));
    }

    let cleanup: { totalDeleted: number; totalKept: number; perUser: any[] } | null = null;
    if (cleanOld && committedFolderIds.size > 0) {
      try {
        cleanup = await cleanupImportsForFolders(token, Array.from(committedFolderIds), existingUsers);
      } catch (e: any) {
        console.warn('[import/commit] cleanup after commit failed:', e.message);
      }
    }

    res.json({ results, bulkFastMode, cleanup });
  } catch (err: any) {
    console.error('Import commit error:', err.message);
    res.status(500).json({ error: '取り込みに失敗しました' });
  }
});

// ── Cleanup endpoint: keep only the latest import set per user (careplan/assessment) ──

const CLEANUP_WINDOW_MS = 10 * 60 * 1000; // files within 10 minutes of the newest are kept as one set

interface CleanupFileEntry {
  id: string;
  name: string;
  modifiedTime: string;
  parentName: string;
}

function isCareplanImport(name: string): boolean {
  return /^解析結果_ケアプラン_/.test(name)
    || /^ケアプラン_.+_\d{8}/.test(name)
    || /ケアプラン.*\.xlsx?$/i.test(name);
}

function isAssessmentImport(name: string): boolean {
  return /^解析結果_アセスメント_/.test(name)
    || /^フェイスシート_アセスメント_/.test(name)
    || /(アセスメント|フェイスシート).*\.xlsx?$/i.test(name);
}

function partitionByLatestSet(files: CleanupFileEntry[]): { keep: CleanupFileEntry[]; trash: CleanupFileEntry[] } {
  if (files.length === 0) return { keep: [], trash: [] };
  const sorted = [...files].sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  const newestTs = new Date(sorted[0].modifiedTime).getTime();
  if (!Number.isFinite(newestTs)) return { keep: sorted, trash: [] };
  const keep: CleanupFileEntry[] = [];
  const trash: CleanupFileEntry[] = [];
  for (const f of sorted) {
    const ts = new Date(f.modifiedTime).getTime();
    if (Number.isFinite(ts) && newestTs - ts <= CLEANUP_WINDOW_MS) keep.push(f);
    else trash.push(f);
  }
  return { keep, trash };
}

async function cleanupImportsForFolders(
  token: string,
  folderIds: string[],
  allUsers: Array<{ folderId: string; folderName: string }>,
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const drive = google.drive({ version: 'v3', auth });

  const byId = new Map(allUsers.map(u => [u.folderId, u.folderName]));
  const perUser: Array<{ userName: string; careplan: { kept: number; deleted: number; deletedNames: string[] }; assessment: { kept: number; deleted: number; deletedNames: string[] } }> = [];
  let totalDeleted = 0;
  let totalKept = 0;

  for (const folderId of folderIds) {
    const userName = byId.get(folderId) || folderId;
    const careplanFolderId = await findSubfolder(token, folderId, '01_居宅サービス計画書');
    const assessFolderId = await findSubfolder(token, folderId, '05_アセスメントシート');

    const careplanFiles: CleanupFileEntry[] = [];
    if (careplanFolderId) {
      const list = await listFilesInFolder(token, careplanFolderId);
      for (const f of list) if (isCareplanImport(f.name)) careplanFiles.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, parentName: '01_居宅サービス計画書' });
    }

    const assessmentFiles: CleanupFileEntry[] = [];
    const rootList = await listFilesInFolder(token, folderId);
    for (const f of rootList) if (isAssessmentImport(f.name)) assessmentFiles.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, parentName: userName });
    if (assessFolderId) {
      const list = await listFilesInFolder(token, assessFolderId);
      for (const f of list) if (isAssessmentImport(f.name)) assessmentFiles.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, parentName: '05_アセスメントシート' });
    }

    const cp = partitionByLatestSet(careplanFiles);
    const as = partitionByLatestSet(assessmentFiles);

    for (const target of [...cp.trash, ...as.trash]) {
      try {
        await drive.files.update({ fileId: target.id, requestBody: { trashed: true }, supportsAllDrives: true });
      } catch (e: any) {
        console.warn('[import/cleanup] trash failed:', target.name, e.message);
      }
    }
    const cpDeleted = cp.trash.length;
    const asDeleted = as.trash.length;
    totalDeleted += cpDeleted + asDeleted;
    totalKept += cp.keep.length + as.keep.length;
    if (cpDeleted + asDeleted + cp.keep.length + as.keep.length > 0) {
      perUser.push({
        userName,
        careplan: { kept: cp.keep.length, deleted: cpDeleted, deletedNames: cp.trash.map(f => f.name) },
        assessment: { kept: as.keep.length, deleted: asDeleted, deletedNames: as.trash.map(f => f.name) },
      });
    }
  }

  return { totalDeleted, totalKept, perUser };
}

importRouter.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const users = await listUserFoldersForImport(token);
    const result = await cleanupImportsForFolders(token, users.map(u => u.folderId), users);
    res.json({ ...result, userCount: users.length });
  } catch (err: any) {
    console.error('Import cleanup error:', err.message);
    res.status(500).json({ error: 'クリーンアップに失敗しました' });
  }
});
