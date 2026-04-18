import { AssessmentImportData } from '../types/imported.js';
import { buildGrid, parseXlsxWithStdlib } from './xlsx-stdlib.js';
import { findLabel, valueOf } from './excel-utils.js';

export async function parseAssessmentWorkbook(buffer: Buffer): Promise<AssessmentImportData> {
  const raw = await parseXlsxWithStdlib(buffer);
  const faceIdx = raw.sheets.findIndex(s => /フェイスシート/.test(s.name));
  const g = faceIdx >= 0 ? buildGrid(raw.sheets[faceIdx]) : [[]];
  const anchorName = findLabel(g, '氏名');
  const anchorKana = findLabel(g, 'フリガナ');
  const anchorBirth = findLabel(g, '生年月日');
  const anchorInsured = findLabel(g, '被保険者番号');

  return {
    sheets: raw.sheets.map(s => s.name),
    faceSheet: {
      sections: {},
      name: anchorName ? valueOf(g, anchorName, 'right') : '',
      kana: anchorKana ? valueOf(g, anchorKana, 'right') : '',
      birthDate: anchorBirth ? valueOf(g, anchorBirth, 'right') : '',
      insuredNumber: anchorInsured ? valueOf(g, anchorInsured, 'right') : '',
      emergencyContacts: [],
      family: [],
    },
    assessment: { sections: {}, items: [] },
    anythingBox: [],
    doctorOpinion: { sections: {} },
    certificationSurvey: { sections: {} },
    rawSheets: raw.sheets as any,
  } as AssessmentImportData;
}
