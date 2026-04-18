import { CareplanImportData } from '../types/imported.js';
import { findLabel, valueOf, extractSelected, parseJapaneseDate } from './excel-utils.js';
import { buildGrid, parseXlsxWithStdlib } from './xlsx-stdlib.js';

function findSheetByName(sheets: Array<{ name: string }>, pattern: RegExp): number {
  return sheets.findIndex(s => pattern.test(s.name.replace(/[\s\u3000]/g, '')));
}

export async function parseCareplanWorkbook(buffer: Buffer): Promise<CareplanImportData> {
  const raw = await parseXlsxWithStdlib(buffer);
  const idx1 = findSheetByName(raw.sheets, /第[1１]表/);
  const g1 = idx1 >= 0 ? buildGrid(raw.sheets[idx1]) : [[]];
  const anchorName = findLabel(g1, '利用者名');
  const anchorBirth = findLabel(g1, '生年月日');
  const anchorLevel = findLabel(g1, '要介護状態区分');
  const anchorOffice = findLabel(g1, '事業所名及び所在地');

  const table1 = {
    userName: anchorName ? valueOf(g1, anchorName, 'right').replace(/\s*殿$/, '') : '',
    birthDate: parseJapaneseDate(anchorBirth ? valueOf(g1, anchorBirth, 'right') : ''),
    careLevel: extractSelected(anchorLevel ? valueOf(g1, anchorLevel, 'right') : '') || '',
    office: anchorOffice ? valueOf(g1, anchorOffice, 'right') : '',
    assessmentResult: '', committeeOpinion: '', totalPolicy: '', livingSupportReason: '',
  };

  const sheetDump = raw.sheets.map(s => ({ name: s.name, maxRow: s.maxRow, maxCol: s.maxCol, cells: s.cells, merges: s.merges }));

  return {
    sheets: raw.sheets.map(s => s.name),
    table1,
    table2: [],
    table3: { timeSlots: [], dailyActivities: '', weeklyExtraServices: '' },
    table4: {},
    table5: [],
    monitoring: { history: [], sessions: [] },
    rawSheets: sheetDump as any,
  } as CareplanImportData;
}
