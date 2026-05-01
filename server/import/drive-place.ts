/**
 * Excel 取込結果を Google Drive / Sheets に配置する。
 *
 * 配置仕様（既存システムの命名規約に合わせる）:
 *   {利用者フォルダ}/原本/  に元の Excel ファイル（拡張子 .xlsx そのまま）
 *   {利用者フォルダ}/取込解析結果/  に
 *     - {YYYY-MM-DD}_careplan.xlsx をコピー（同じ Excel）
 *     - {YYYY-MM-DD}_careplan.json (パース結果 JSON)
 *     - 同様に assessment についても
 *   既存の drafts シートに plan_json として GeneratedPlan を append（kind='careplan'のときのみ）
 */

import { google } from 'googleapis';
import { findSubfolder } from '../lib/drive.js';
import { appendSheetData } from '../lib/sheets.js';
import type { ImportedCareplan, ImportedAssessmentBundle } from '../types/imported.js';
import type { GeneratedPlan } from '../types/plan.js';

function getDrive(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
}

/**
 * 親フォルダ配下に同名サブフォルダがあれば返す、無ければ作成する。
 */
export async function ensureSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const existing = await findSubfolder(accessToken, parentFolderId, folderName);
  if (existing) return existing;
  const drive = getDrive(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id!;
}

/** 元 Excel をフォルダにアップロード */
export async function uploadExcelToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ id: string; webViewLink?: string }> {
  const drive = getDrive(accessToken);
  // ストリーム化のために PassThrough を使う
  // googleapis は Buffer を直接受けられない場合があるので Readable に変換
  const { Readable } = await import('node:stream');
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: stream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink || undefined };
}

/** 解析 JSON をフォルダにアップロード */
export async function uploadJsonToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  data: unknown
): Promise<{ id: string; webViewLink?: string }> {
  const drive = getDrive(accessToken);
  const { Readable } = await import('node:stream');
  const stream = Readable.from(Buffer.from(JSON.stringify(data, null, 2)));
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink || undefined };
}

/** YYYY-MM-DD を返す（タイムゾーン依存しないようローカル時刻で組む） */
export function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PlaceCareplanResult {
  originalExcelUrl: string;
  analysisJsonUrl: string;
  draftId?: string;
}

export async function placeCareplan(
  accessToken: string,
  userFolderId: string,
  fileName: string,
  excelBuffer: Buffer,
  parsed: ImportedCareplan,
  draft: {
    settingsSpreadsheetId: string;
    plan: GeneratedPlan;
    clientName: string;
    authorEmail: string;
    authorName: string;
    mode: 'kyotaku' | 'shoki';
    overwriteDraft?: boolean;
  } | null
): Promise<PlaceCareplanResult> {
  const originalsFolderId = await ensureSubfolder(accessToken, userFolderId, '原本');
  const analyzeFolderId = await ensureSubfolder(accessToken, userFolderId, '取込解析結果');

  const baseName = fileName.replace(/\.xlsx$/i, '');
  const ts = todayString();

  const original = await uploadExcelToFolder(
    accessToken,
    originalsFolderId,
    fileName,
    excelBuffer
  );
  const analysis = await uploadJsonToFolder(
    accessToken,
    analyzeFolderId,
    `${ts}_${baseName}_careplan.json`,
    parsed
  );

  let draftId: string | undefined;
  if (draft) {
    draftId = draft.plan.id;
    const row = [
      draftId,
      userFolderId,
      draft.clientName,
      draft.authorEmail,
      draft.authorName,
      draft.mode,
      'imported',
      JSON.stringify(draft.plan),
      '',
      new Date().toISOString(),
    ];
    await appendSheetData(accessToken, draft.settingsSpreadsheetId, 'drafts!A:J', [row]);
  }

  return {
    originalExcelUrl:
      original.webViewLink || `https://drive.google.com/file/d/${original.id}/view`,
    analysisJsonUrl:
      analysis.webViewLink || `https://drive.google.com/file/d/${analysis.id}/view`,
    draftId,
  };
}

export interface PlaceAssessmentResult {
  originalExcelUrl: string;
  analysisJsonUrl: string;
}

export async function placeAssessment(
  accessToken: string,
  userFolderId: string,
  fileName: string,
  excelBuffer: Buffer,
  parsed: ImportedAssessmentBundle
): Promise<PlaceAssessmentResult> {
  const originalsFolderId = await ensureSubfolder(accessToken, userFolderId, '原本');
  const analyzeFolderId = await ensureSubfolder(accessToken, userFolderId, '取込解析結果');

  const baseName = fileName.replace(/\.xlsx$/i, '');
  const ts = todayString();

  const original = await uploadExcelToFolder(
    accessToken,
    originalsFolderId,
    fileName,
    excelBuffer
  );
  const analysis = await uploadJsonToFolder(
    accessToken,
    analyzeFolderId,
    `${ts}_${baseName}_assessment.json`,
    parsed
  );
  return {
    originalExcelUrl:
      original.webViewLink || `https://drive.google.com/file/d/${original.id}/view`,
    analysisJsonUrl:
      analysis.webViewLink || `https://drive.google.com/file/d/${analysis.id}/view`,
  };
}

/** 新規利用者フォルダを作成 (rootFolderId 直下) */
export async function createNewUserFolder(
  accessToken: string,
  rootFolderId: string,
  userName: string
): Promise<{ folderId: string; folderName: string }> {
  const drive = getDrive(accessToken);
  const folderName = userName.endsWith('様') ? userName : `${userName}様`;
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return { folderId: res.data.id!, folderName };
}
