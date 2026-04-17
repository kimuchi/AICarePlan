import { appendSheetData } from '../lib/sheets.js';
import { createFileFromBuffer, createGoogleSheetFromExcel, findSubfolder, getFileMeta, renameStarTab } from '../lib/drive.js';
import { toGeneratedPlan } from './to-generated-plan.js';

export async function placeCareplanArtifacts(params: {
  token: string;
  userFolderId: string;
  userName: string;
  originalName: string;
  excelBuffer: Buffer;
  parsed: any;
  overwriteDraft?: boolean;
  actorEmail?: string;
}) {
  const { token, userFolderId, userName, originalName, excelBuffer, parsed } = params;
  const careplanFolderId = await findSubfolder(token, userFolderId, '01_居宅サービス計画書');
  if (!careplanFolderId) throw new Error('01_居宅サービス計画書 not found');
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const excelId = await createFileFromBuffer(token, careplanFolderId, originalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', excelBuffer);
  const sheetName = `ケアプラン_${userName.replace(/\s+/g,'')}_${date}`;
  const sheetId = await createGoogleSheetFromExcel(token, careplanFolderId, sheetName, excelBuffer);
  await renameStarTab(token, sheetId, '★第1表');
  const generatedPlan = toGeneratedPlan(parsed);
  const jsonName = `解析結果_ケアプラン_${userName.replace(/\s+/g,'')}_${date}.json`;
  const jsonBody = Buffer.from(JSON.stringify({ ...parsed, generatedPlan }, null, 2), 'utf-8');
  const jsonId = await createFileFromBuffer(token, careplanFolderId, jsonName, 'application/json', jsonBody);

  const sid = process.env.SETTINGS_SPREADSHEET_ID;
  let draftId = '';
  if (sid) {
    draftId = `draft-${Date.now().toString(36)}`;
    const mode = /小規模多機能/.test(parsed?.table1?.office || '') ? 'shoki' : 'kyotaku';
    await appendSheetData(token, sid, 'drafts!A:J', [[draftId, userFolderId, params.userName, params.actorEmail || '', '', mode, 'draft', JSON.stringify({ plans: [generatedPlan] }), '', new Date().toISOString()]]);
  }
  return {
    originalExcelUrl: `https://drive.google.com/file/d/${excelId}/view`,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
    analysisJsonUrl: `https://drive.google.com/file/d/${jsonId}/view`,
    draftId,
  };
}

export async function placeAssessmentArtifacts(params: {
  token: string;
  userFolderId: string;
  userName: string;
  originalName: string;
  excelBuffer: Buffer;
  parsed: any;
}) {
  const { token, userFolderId, userName, originalName, excelBuffer, parsed } = params;
  const assessFolderId = await findSubfolder(token, userFolderId, '05_アセスメントシート');
  if (!assessFolderId) throw new Error('05_アセスメントシート not found');
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const excelId = await createFileFromBuffer(token, userFolderId, originalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', excelBuffer);
  const sheetName = `フェイスシート_アセスメント_${userName}様`;
  const sheetId = await createGoogleSheetFromExcel(token, userFolderId, sheetName, excelBuffer);
  await renameStarTab(token, sheetId, '★フェイスシート');
  const jsonName = `解析結果_アセスメント_${userName.replace(/\s+/g,'')}_${date}.json`;
  const jsonId = await createFileFromBuffer(token, assessFolderId, jsonName, 'application/json', Buffer.from(JSON.stringify(parsed, null, 2), 'utf-8'));
  return {
    originalExcelUrl: `https://drive.google.com/file/d/${excelId}/view`,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
    analysisJsonUrl: `https://drive.google.com/file/d/${jsonId}/view`,
  };
}
