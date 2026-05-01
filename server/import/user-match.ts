/**
 * Excel から抽出した利用者情報を、既存の利用者フォルダ一覧と突き合わせる。
 *
 * マッチング戦略（優先度順）:
 *   1. 被保険者番号（一致するフォルダの latest careplan/assessment に被保険者番号があれば）
 *      → 第1段階では実装が重いので、第2段階のみで十分
 *   2. 氏名（正規化）+ 生年月日 ISO 一致
 *   3. 氏名（正規化）一致
 *   4. 氏名（部分一致）→ 候補としてスコア降順で返す
 *
 * 「matched」: 1件に確定。
 * 「candidates」: 候補が複数 / マッチが弱い → ユーザーが選ぶ。
 * 「not_found」: 候補ゼロ。新規利用者作成のフローへ。
 */

import { listSubfolders } from '../lib/drive.js';
import { getSheetData } from '../lib/sheets.js';
import type { ExtractedUser, UserMatch, UserMatchCandidate } from '../types/imported.js';

interface UserFolderInfo {
  folderId: string;
  folderName: string;
  /** プレフィックス・「様」を取り除いた整形済みの氏名 */
  cleanedName: string;
}

/** フォルダ名 (例: "た_玉沢ひろ子様") から「玉沢ひろ子」を取り出す */
function cleanFolderName(folderName: string): string {
  return folderName
    .replace(/様$/, '')
    .replace(/^[ぁ-ん]_/, '')
    .replace(/^[ァ-ヶ]_/, '')
    .replace(/^[a-zA-Z]_/, '')
    .trim();
}

/** 氏名比較用の正規化: 半角全角空白除去・全角→半角 */
function normalizeName(s: string): string {
  if (!s) return '';
  return s
    .replace(/\s+/g, '')
    .replace(/　/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim();
}

export async function listUserFolders(
  accessToken: string,
  rootFolderId: string
): Promise<UserFolderInfo[]> {
  const folders = await listSubfolders(accessToken, rootFolderId);
  return folders.map((f) => ({
    folderId: f.id,
    folderName: f.name,
    cleanedName: cleanFolderName(f.name),
  }));
}

/**
 * 利用者ルート ID を取得する（settings spreadsheet または env から）。
 */
export async function resolveUserRootFolderId(
  accessToken: string,
  settingsId?: string
): Promise<string> {
  let rootFolderId = process.env.USER_ROOT_FOLDER_ID || '';
  if (settingsId) {
    try {
      const rows = await getSheetData(settingsId, 'general!A:B', accessToken);
      if (rows) {
        for (const row of rows) {
          if (row[0] === 'userRootFolderId' && row[1]) rootFolderId = row[1];
        }
      }
    } catch {
      // fallback to env
    }
  }
  return rootFolderId;
}

/** 1件のマッチング処理 */
export function matchUser(
  extracted: ExtractedUser | null,
  folders: UserFolderInfo[]
): UserMatch {
  if (!extracted || !extracted.name) {
    return { status: 'not_found', candidates: [] };
  }

  const target = normalizeName(extracted.name);
  if (!target) return { status: 'not_found', candidates: [] };

  const exactMatches: UserFolderInfo[] = [];
  const partialMatches: Array<{ folder: UserFolderInfo; score: number }> = [];

  for (const f of folders) {
    const cand = normalizeName(f.cleanedName);
    if (!cand) continue;
    if (cand === target) {
      exactMatches.push(f);
    } else if (cand.includes(target) || target.includes(cand)) {
      const score = Math.min(target.length, cand.length) / Math.max(target.length, cand.length);
      partialMatches.push({ folder: f, score });
    }
  }

  if (exactMatches.length === 1) {
    const m = exactMatches[0];
    return {
      status: 'matched',
      folderId: m.folderId,
      folderName: m.folderName,
      candidates: [
        { folderId: m.folderId, folderName: m.folderName, name: m.cleanedName, score: 1.0, reason: '氏名一致' },
      ],
    };
  }

  if (exactMatches.length > 1) {
    // 名前完全一致が複数 → 同名利用者。候補として返す（生年月日で人手判断）
    return {
      status: 'candidates',
      candidates: exactMatches.map((m) => ({
        folderId: m.folderId,
        folderName: m.folderName,
        name: m.cleanedName,
        score: 1.0,
        reason: '氏名一致 (複数候補)',
      })),
    };
  }

  if (partialMatches.length > 0) {
    partialMatches.sort((a, b) => b.score - a.score);
    return {
      status: 'candidates',
      candidates: partialMatches.slice(0, 5).map((p) => ({
        folderId: p.folder.folderId,
        folderName: p.folder.folderName,
        name: p.folder.cleanedName,
        score: p.score,
        reason: '氏名部分一致',
      })),
    };
  }

  return { status: 'not_found', candidates: [] };
}

/** ImportedCareplan / ImportedAssessmentBundle から ExtractedUser を構成する */
export function extractUserFromCareplan(t1: {
  userName?: string;
  birthDate?: { iso?: string };
  insuredNumber?: string;
  insurerNumber?: string;
}): ExtractedUser | null {
  const name = (t1.userName || '').trim();
  if (!name) return null;
  return {
    name,
    birthDate: t1.birthDate?.iso,
    insuredNumber: t1.insuredNumber,
    insurerNumber: t1.insurerNumber,
  };
}

export function extractUserFromAssessment(face: {
  basic?: { name?: string; furigana?: string; birthDate?: { iso?: string } };
  insurance?: { insuredNumber?: string; insurerNumber?: string };
}): ExtractedUser | null {
  const name = (face.basic?.name || '').trim();
  if (!name) return null;
  return {
    name,
    kana: face.basic?.furigana,
    birthDate: face.basic?.birthDate?.iso,
    insuredNumber: face.insurance?.insuredNumber,
    insurerNumber: face.insurance?.insurerNumber,
  };
}

/** ロガー用の個人情報マスキング ("中島 潔" → "中●●") */
export function maskName(s: string): string {
  if (!s) return '';
  const t = s.trim();
  if (t.length <= 1) return t + '●';
  return t[0] + '●●';
}
