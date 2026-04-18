import { AssessmentImportData } from '../types/imported.js';
import { buildGrid, parseXlsxWithStdlib } from './xlsx-stdlib.js';

function norm(s: string): string {
  return (s || '').replace(/[\s\u3000]+/g, '').trim();
}

function findLabelExact(grid: string[][], label: string): { row: number; col: number } | null {
  const target = norm(label);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      if (norm(grid[r][c] || '') === target) return { row: r, col: c };
    }
  }
  return null;
}

function valueRightOf(grid: string[][], anchor: { row: number; col: number }): string {
  const row = grid[anchor.row] || [];
  const anchorVal = norm(row[anchor.col] || '');
  for (let c = anchor.col + 1; c < row.length; c++) {
    const v = (row[c] || '').trim();
    if (v && norm(v) !== anchorVal) return v;
  }
  return '';
}

function collectSections(grid: string[][]): Record<string, Array<Record<string, string>>> {
  // Sections are rows starting with "■ <title>"
  const sections: Record<string, Array<Record<string, string>>> = {};
  let current = '';
  let rows: Array<Record<string, string>> = [];
  const flush = () => { if (current) sections[current] = rows; };
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const first = (row[0] || '').trim();
    const m = /^■\s*(.+)$/.exec(first);
    if (m) {
      flush();
      current = m[1].trim();
      rows = [];
      continue;
    }
    if (!current) continue;
    const pairs: Record<string, string> = {};
    let has = false;
    for (let c = 0; c < row.length; c++) {
      const v = (row[c] || '').trim();
      if (v) { pairs[`c${c + 1}`] = v; has = true; }
    }
    if (has) rows.push(pairs);
  }
  flush();
  return sections;
}

export async function parseAssessmentWorkbook(buffer: Buffer): Promise<AssessmentImportData> {
  const raw = await parseXlsxWithStdlib(buffer);
  const faceIdx = raw.sheets.findIndex(s => /フェイスシート/.test(s.name));
  const assessIdx = raw.sheets.findIndex(s => /^アセスメント/.test(s.name));
  const anyboxIdx = raw.sheets.findIndex(s => /なんでもボックス/.test(s.name));
  const doctorIdx = raw.sheets.findIndex(s => /主治医意見書/.test(s.name));
  const surveyIdx = raw.sheets.findIndex(s => /認定調査票/.test(s.name));

  const faceGrid = faceIdx >= 0 ? buildGrid(raw.sheets[faceIdx]) : [[]];
  const assessGrid = assessIdx >= 0 ? buildGrid(raw.sheets[assessIdx]) : [[]];
  const anyboxGrid = anyboxIdx >= 0 ? buildGrid(raw.sheets[anyboxIdx]) : [[]];
  const doctorGrid = doctorIdx >= 0 ? buildGrid(raw.sheets[doctorIdx]) : [[]];
  const surveyGrid = surveyIdx >= 0 ? buildGrid(raw.sheets[surveyIdx]) : [[]];

  const faceLabels: Record<string, string[]> = {
    name: ['氏名'],
    kana: ['フリガナ'],
    birthDate: ['生年月日'],
    gender: ['性別'],
    address: ['住所'],
    tel: ['TEL'],
    insuredNumber: ['被保険者番号'],
    insurerNumber: ['保険者番号'],
    coPayRatio: ['負担割合'],
    medicalInsurance: ['医療保険'],
    disabilityCard: ['障害者手帳'],
    livelihoodProtection: ['生活保護'],
    careLevel: ['要介護度'],
    certPeriod: ['認定期間'],
    certDate: ['認定日'],
    supportLimit: ['支給限度基準額'],
    doctor: ['主治医'],
    doctorNote: ['医学的管理の必要性'],
    remarks: ['備考（服薬・感染症・留意事項等）', '備考'],
  };
  const faceSheet: Record<string, any> = { sections: collectSections(faceGrid) };
  for (const [key, cands] of Object.entries(faceLabels)) {
    for (const label of cands) {
      const a = findLabelExact(faceGrid, label);
      if (!a) continue;
      const v = valueRightOf(faceGrid, a);
      if (v) { faceSheet[key] = v; break; }
    }
  }
  // Emergency contacts (after "■ 緊急連絡先")
  const emergency: Array<{ name: string; relation: string; tel: string; note: string }> = [];
  let emAnchor: { row: number; col: number } | null = findLabelExact(faceGrid, '緊急連絡先');
  if (!emAnchor) {
    for (let r = 0; r < faceGrid.length; r++) {
      if (/緊急連絡先/.test(faceGrid[r]?.[0] || '')) { emAnchor = { row: r, col: 0 }; break; }
    }
  }
  if (emAnchor) {
    for (let r = emAnchor.row + 2; r < Math.min(faceGrid.length, emAnchor.row + 8); r++) {
      const row = faceGrid[r] || [];
      if ((row[0] || '').startsWith('■')) break;
      const [, name, relation, tel, note] = row;
      if (name || relation || tel || note) {
        emergency.push({ name: (name || '').trim(), relation: (relation || '').trim(), tel: (tel || '').trim(), note: (note || '').trim() });
      }
    }
  }
  faceSheet.emergencyContacts = emergency;
  faceSheet.family = [];

  return {
    sheets: raw.sheets.map(s => s.name),
    faceSheet,
    assessment: { sections: collectSections(assessGrid) },
    anythingBox: anyboxGrid.slice(1).filter(r => r && r.some(v => (v || '').trim())).map(r => ({
      raw: r.filter(v => (v || '').trim()).join(' | '),
    })),
    doctorOpinion: { sections: collectSections(doctorGrid) },
    certificationSurvey: { sections: collectSections(surveyGrid) },
  } as AssessmentImportData;
}
