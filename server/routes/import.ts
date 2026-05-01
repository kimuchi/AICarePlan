/**
 * Excel 取込 API ルート。
 *
 *   POST /api/import/preview  — multipart で複数 Excel を受けてパース結果プレビューを返す
 *   POST /api/import/commit   — 確定リクエストを受けて Drive/Sheets に配置する
 *   GET  /api/users/:folderId/careplan-latest    — 最新ケアプラン JSON を返す
 *   GET  /api/users/:folderId/assessment-latest  — 最新アセスメント JSON を返す
 *
 * ファイルは一時的にメモリに保持する（次の commit までキャッシュ）。
 * 同一プロセス内で fileId（uuid）→ Buffer をマップする。
 * Cloud Run の単一インスタンス想定。スケール時は Drive 一時保管に要切替。
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { getAccessToken } from '../auth.js';
import { listFilesInFolder, getJsonFileContent, findSubfolder } from '../lib/drive.js';
import { parseCareplanWorkbook } from '../import/parse-careplan.js';
import { parseAssessmentWorkbook } from '../import/parse-assessment.js';
import { toGeneratedPlan } from '../import/to-generated-plan.js';
import {
  resolveUserRootFolderId,
  listUserFolders,
  matchUser,
  extractUserFromCareplan,
  extractUserFromAssessment,
  maskName,
} from '../import/user-match.js';
import {
  placeCareplan,
  placeAssessment,
  createNewUserFolder,
} from '../import/drive-place.js';
import type {
  ImportKind,
  PreviewItem,
  PreviewResponse,
  CommitRequestItem,
  CommitResponse,
  CommitResultItem,
  ImportedCareplan,
  ImportedAssessmentBundle,
  LatestCareplanResponse,
  LatestAssessmentResponse,
} from '../types/imported.js';

export const importRouter = Router();
export const usersExtraRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB/file
});

/**
 * セッションスコープのファイルキャッシュ。
 * セッション間にまたがる利用は想定しない（preview→commit は同一セッションで）。
 */
interface CachedFile {
  fileName: string;
  buffer: Buffer;
  kind: ImportKind;
  parsedCareplan?: ImportedCareplan;
  parsedAssessment?: ImportedAssessmentBundle;
  expiresAt: number;
}
const fileCache = new Map<string, CachedFile>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30分

function gcCache() {
  const now = Date.now();
  for (const [k, v] of fileCache) {
    if (v.expiresAt < now) fileCache.delete(k);
  }
}

function detectKind(fileName: string): ImportKind {
  const n = fileName;
  if (/ケアプラン|careplan/i.test(n)) return 'careplan';
  if (/アセスメント|フェイスシート|assessment|facesheet/i.test(n)) return 'assessment_facesheet';
  return 'unknown';
}

/** POST /api/import/preview */
importRouter.post('/preview', upload.array('files', 50), async (req: Request, res: Response) => {
  gcCache();
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'ファイルが指定されていません' });
    }

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID || '';
    const rootFolderId = await resolveUserRootFolderId(token, settingsId);
    if (!rootFolderId) {
      return res.status(400).json({ error: '利用者フォルダルートIDが未設定です' });
    }
    const folders = await listUserFolders(token, rootFolderId);

    const items: PreviewItem[] = [];
    for (const f of files) {
      const fileId = uuid();
      const fileName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      // multer は filename を latin1 で渡すため、UTF-8 に再解釈する
      const kind = detectKind(fileName);
      let parsedCareplan: ImportedCareplan | undefined;
      let parsedAssessment: ImportedAssessmentBundle | undefined;
      const warnings: string[] = [];

      try {
        if (kind === 'careplan') {
          parsedCareplan = await parseCareplanWorkbook(f.buffer, fileName);
          warnings.push(...parsedCareplan.warnings);
        } else if (kind === 'assessment_facesheet') {
          parsedAssessment = await parseAssessmentWorkbook(f.buffer, fileName);
          warnings.push(...parsedAssessment.warnings);
        } else {
          // unknown: 中身を覗いてシート名から推定
          try {
            parsedCareplan = await parseCareplanWorkbook(f.buffer, fileName);
            if (parsedCareplan.sheetNames.some((n) => /第[1-5１-５]表/.test(n))) {
              warnings.push(...parsedCareplan.warnings);
            } else {
              parsedCareplan = undefined;
              parsedAssessment = await parseAssessmentWorkbook(f.buffer, fileName);
              warnings.push(...parsedAssessment.warnings);
            }
          } catch {
            warnings.push('Excelファイルの形式を判定できません');
          }
        }
      } catch (e) {
        warnings.push(`パース失敗: ${(e as Error).message}`);
      }

      const extracted = parsedCareplan
        ? extractUserFromCareplan(parsedCareplan.table1)
        : parsedAssessment
        ? extractUserFromAssessment({
            basic: parsedAssessment.faceSheet.basic,
            insurance: parsedAssessment.faceSheet.insurance,
          })
        : null;

      const userMatch = matchUser(extracted, folders);

      // キャッシュに保存
      fileCache.set(fileId, {
        fileName,
        buffer: f.buffer,
        kind: parsedCareplan ? 'careplan' : parsedAssessment ? 'assessment_facesheet' : 'unknown',
        parsedCareplan,
        parsedAssessment,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      const summary: PreviewItem['summary'] = {
        sheets: parsedCareplan?.sheetNames || parsedAssessment?.sheetNames || [],
      };
      if (parsedCareplan) {
        summary.careLevel = parsedCareplan.table1.careLevel;
        summary.createdDate = parsedCareplan.table1.createDate.iso || parsedCareplan.table1.createDate.raw;
        summary.needsCount = parsedCareplan.table2.length;
        summary.monitoringCount = parsedCareplan.monitoring.history.length;
      }
      if (parsedAssessment) {
        summary.anythingBoxCount = parsedAssessment.anythingBox.length;
        summary.careLevel = parsedAssessment.faceSheet.certification.careLevel;
      }

      items.push({
        fileId,
        fileName,
        kind: parsedCareplan ? 'careplan' : parsedAssessment ? 'assessment_facesheet' : 'unknown',
        extractedUser: extracted
          ? { ...extracted, name: extracted.name } // 個人情報そのまま返す（社内クライアント）
          : null,
        userMatch,
        summary,
        warnings,
      });

      console.log(`[import/preview] file=${fileName} user=${maskName(extracted?.name || '')} match=${userMatch.status}`);
    }

    const out: PreviewResponse = { items };
    res.json(out);
  } catch (err) {
    const e = err as Error;
    console.error('[import/preview] error:', e.message);
    res.status(500).json({ error: 'preview failed: ' + e.message });
  }
});

/** POST /api/import/commit */
importRouter.post('/commit', async (req: Request, res: Response) => {
  gcCache();
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const items: CommitRequestItem[] = req.body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 配列が必要です' });
    }

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID || '';
    const rootFolderId = await resolveUserRootFolderId(token, settingsId);
    if (!rootFolderId) {
      return res.status(400).json({ error: '利用者フォルダルートIDが未設定です' });
    }

    const user = (req as Request & { user?: { email?: string; name?: string } }).user;
    const authorEmail = user?.email || 'unknown@example.com';
    const authorName = user?.name || 'unknown';

    const results: CommitResultItem[] = [];
    for (const it of items) {
      const messages: string[] = [];
      const cached = fileCache.get(it.fileId);
      if (!cached) {
        results.push({
          fileId: it.fileId,
          kind: 'unknown',
          ok: false,
          artifacts: {},
          messages: ['キャッシュ期限切れ。再アップロードしてください。'],
        });
        continue;
      }
      try {
        // 利用者フォルダ ID を確定
        let userFolderId = it.userFolderId || '';
        if (!userFolderId && it.createNewUser) {
          const created = await createNewUserFolder(token, rootFolderId, it.createNewUser.name);
          userFolderId = created.folderId;
          messages.push(`新規利用者フォルダ "${created.folderName}" を作成しました`);
        }
        if (!userFolderId) {
          throw new Error('利用者フォルダが指定されていません');
        }

        if (cached.kind === 'careplan' && cached.parsedCareplan) {
          const plan = toGeneratedPlan(cached.parsedCareplan);
          const draftCfg = settingsId
            ? {
                settingsSpreadsheetId: settingsId,
                plan,
                clientName: cached.parsedCareplan.table1.userName,
                authorEmail,
                authorName,
                mode: 'shoki' as const,
                overwriteDraft: it.options?.overwriteDraft,
              }
            : null;
          const r = await placeCareplan(
            token,
            userFolderId,
            cached.fileName,
            cached.buffer,
            cached.parsedCareplan,
            draftCfg
          );
          results.push({
            fileId: it.fileId,
            fileName: cached.fileName,
            kind: 'careplan',
            ok: true,
            artifacts: {
              originalExcelUrl: r.originalExcelUrl,
              analysisJsonUrl: r.analysisJsonUrl,
              draftId: r.draftId,
            },
            messages,
          });
        } else if (cached.kind === 'assessment_facesheet' && cached.parsedAssessment) {
          const r = await placeAssessment(
            token,
            userFolderId,
            cached.fileName,
            cached.buffer,
            cached.parsedAssessment
          );
          results.push({
            fileId: it.fileId,
            fileName: cached.fileName,
            kind: 'assessment_facesheet',
            ok: true,
            artifacts: {
              originalExcelUrl: r.originalExcelUrl,
              analysisJsonUrl: r.analysisJsonUrl,
            },
            messages,
          });
        } else {
          throw new Error('未対応の取込種別です');
        }
        // 成功したらキャッシュ削除
        fileCache.delete(it.fileId);
      } catch (e) {
        const err = e as Error;
        results.push({
          fileId: it.fileId,
          fileName: cached.fileName,
          kind: cached.kind,
          ok: false,
          artifacts: {},
          messages: [...messages, err.message],
        });
      }
    }

    const out: CommitResponse = { results };
    res.json(out);
  } catch (err) {
    const e = err as Error;
    console.error('[import/commit] error:', e.message);
    res.status(500).json({ error: 'commit failed: ' + e.message });
  }
});

// ── 利用者ごとの最新参考情報 ──

async function findLatestJson(
  accessToken: string,
  folderId: string,
  suffixRe: RegExp
): Promise<{ fileId: string; fileName: string; modifiedTime: string } | null> {
  const sub = await findSubfolder(accessToken, folderId, '取込解析結果');
  if (!sub) return null;
  const files = await listFilesInFolder(accessToken, sub, 'application/json');
  const matched = files.filter((f) => suffixRe.test(f.name));
  if (matched.length === 0) return null;
  matched.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  const top = matched[0];
  return { fileId: top.id, fileName: top.name, modifiedTime: top.modifiedTime };
}

usersExtraRouter.get('/:folderId/careplan-latest', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const folderId = String(req.params.folderId);
    const src = await findLatestJson(token, folderId, /careplan\.json$/i);
    if (!src) {
      const out: LatestCareplanResponse = { found: false };
      return res.json(out);
    }
    const data = (await getJsonFileContent(token, src.fileId)) as ImportedCareplan;
    const out: LatestCareplanResponse = {
      found: true,
      source: src,
      data,
    };
    res.json(out);
  } catch (err) {
    const e = err as Error;
    console.error('[careplan-latest] error:', e.message);
    res.status(500).json({ error: 'fetch failed: ' + e.message });
  }
});

usersExtraRouter.get('/:folderId/assessment-latest', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const folderId = String(req.params.folderId);
    const src = await findLatestJson(token, folderId, /assessment\.json$/i);
    if (!src) {
      const out: LatestAssessmentResponse = { found: false };
      return res.json(out);
    }
    const data = (await getJsonFileContent(token, src.fileId)) as ImportedAssessmentBundle;
    const out: LatestAssessmentResponse = {
      found: true,
      source: { kind: 'json', ...src },
      data,
    };
    res.json(out);
  } catch (err) {
    const e = err as Error;
    console.error('[assessment-latest] error:', e.message);
    res.status(500).json({ error: 'fetch failed: ' + e.message });
  }
});
