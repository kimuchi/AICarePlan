import { appendSheetData } from '../lib/sheets.js';
import { createFileFromBuffer, createGoogleSheetFromExcel, createSpreadsheetInFolder, findSubfolder, renameStarTab, trashFilesByName } from '../lib/drive.js';
import { toGeneratedPlan } from './to-generated-plan.js';

/** 事業所名・住所・電話番号を office 文字列から抽出 */
function splitOfficeString(s: string): { facility: string; facilityAddress: string } {
  if (!s) return { facility: '', facilityAddress: '' };
  // 典型例: "燦々ほーむ あらかわ (1391800313)  /  〒116-0002 東京都...  TEL: 03-3805-5885"
  const parts = s.split(/\s*\/\s*/);
  const facility = (parts[0] || '').trim();
  const rest = parts.slice(1).join(' / ').trim();
  return { facility, facilityAddress: rest };
}

function parsedToUserProfile(parsed: any): any {
  const t1 = parsed?.table1 || {};
  const birth = t1.birthDate || {};
  const certP = t1.certPeriod || {};
  return {
    name: t1.userName || '',
    furigana: '',
    birthDate: birth.wareki || birth.iso || '',
    age: birth.age != null ? String(birth.age) : '',
    address: t1.address || '',
    careLevel: t1.careLevel || '',
    insuranceNo: t1.insuredNumber || '',
    certDate: t1.certDate || '',
    certPeriodStart: certP.rawFrom || certP.fromIso || '',
    certPeriodEnd: certP.rawTo || certP.toIso || '',
    firstCreateDate: t1.firstCreatedDate || '',
  };
}

function parsedToUserMeta(parsed: any): any {
  const t1 = parsed?.table1 || {};
  const birth = t1.birthDate || {};
  const certP = t1.certPeriod || {};
  return {
    name: t1.userName || '',
    birthDate: birth.wareki || birth.iso || '',
    address: t1.address || '',
    careLevel: t1.careLevel || '',
    certDate: t1.certDate || '',
    certPeriod: {
      start: certP.rawFrom || certP.fromIso || '',
      end: certP.rawTo || certP.toIso || '',
    },
  };
}

function parsedToPlanMeta(parsed: any): any {
  const t1 = parsed?.table1 || {};
  const { facility, facilityAddress } = splitOfficeString(t1.office || '');
  return {
    creator: t1.creatorName || '',
    facility,
    facilityAddress,
    createDate: t1.createdDate || '',
    firstCreateDate: t1.firstCreatedDate || '',
  };
}

export async function placeCareplanArtifacts(params: {
  token: string;
  userFolderId: string;
  userName: string;
  originalName: string;
  excelBuffer: Buffer;
  parsed: any;
  overwriteDraft?: boolean;
  actorEmail?: string;
  skipSheetConversion?: boolean;
  forceMode?: 'kyotaku' | 'shoki';
}) {
  const { token, userFolderId, userName, originalName, excelBuffer, parsed } = params;
  const messages: string[] = [];
  const careplanFolderId = await findSubfolder(token, userFolderId, '01_居宅サービス計画書');
  if (!careplanFolderId) throw new Error('01_居宅サービス計画書 not found');
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const excelId = await createFileFromBuffer(token, careplanFolderId, originalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', excelBuffer);
  const sheetName = `ケアプラン_${userName.replace(/\s+/g,'')}_${date}`;
  const sheetId = await createGoogleSheetFromExcel(token, careplanFolderId, sheetName, excelBuffer);
  await renameStarTab(token, sheetId, '★第1表');
  const generatedPlan = toGeneratedPlan(parsed);
  const jsonName = `解析結果_ケアプラン_${userName.replace(/\s+/g,'')}.json`;
  await trashFilesByName(token, careplanFolderId, jsonName);
  const userProfile = parsedToUserProfile(parsed);
  const editedUserMeta = parsedToUserMeta(parsed);
  const editedPlanMeta = parsedToPlanMeta(parsed);
  const jsonBody = Buffer.from(JSON.stringify({ ...parsed, generatedPlan, userProfile, editedUserMeta, editedPlanMeta }, null, 2), 'utf-8');
  const jsonId = await createFileFromBuffer(token, careplanFolderId, jsonName, 'application/json', jsonBody);

  const sid = process.env.SETTINGS_SPREADSHEET_ID;
  let draftId = '';
  if (sid) {
    draftId = `draft-${Date.now().toString(36)}`;
    const mode = params.forceMode || (/小規模多機能/.test(parsed?.table1?.office || '') ? 'shoki' : 'kyotaku');
    const planJson = JSON.stringify({ plans: [generatedPlan], userProfile, editedUserMeta, editedPlanMeta });
    await appendSheetData(token, sid, 'drafts!A:L', [[draftId, userFolderId, params.userName, params.actorEmail || '', '', mode, 'draft', planJson, '', new Date().toISOString(), '', '']]);
  }
  return {
    originalExcelUrl: `https://drive.google.com/file/d/${excelId}/view`,
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : '',
    analysisJsonUrl: `https://drive.google.com/file/d/${jsonId}/view`,
    draftId,
    messages,
  };
}

export async function placeAssessmentArtifacts(params: {
  token: string;
  userFolderId: string;
  userName: string;
  originalName: string;
  excelBuffer: Buffer;
  parsed: any;
  skipSheetConversion?: boolean;
}) {
  const { token, userFolderId, userName, originalName, excelBuffer, parsed } = params;
  const messages: string[] = [];
  const assessFolderId = await findSubfolder(token, userFolderId, '05_アセスメントシート');
  if (!assessFolderId) throw new Error('05_アセスメントシート not found');
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const excelId = await createFileFromBuffer(token, userFolderId, originalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', excelBuffer);
  const sheetName = `フェイスシート_アセスメント_${userName}様`;
  const sheetId = await createGoogleSheetFromExcel(token, userFolderId, sheetName, excelBuffer);
  await renameStarTab(token, sheetId, '★フェイスシート');
  const jsonName = `解析結果_アセスメント_${userName.replace(/\s+/g,'')}.json`;
  await trashFilesByName(token, assessFolderId, jsonName);
  const jsonId = await createFileFromBuffer(token, assessFolderId, jsonName, 'application/json', Buffer.from(JSON.stringify(parsed, null, 2), 'utf-8'));
  return {
    originalExcelUrl: `https://drive.google.com/file/d/${excelId}/view`,
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : '',
    analysisJsonUrl: `https://drive.google.com/file/d/${jsonId}/view`,
    messages,
  };
}
