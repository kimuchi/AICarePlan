import { CareplanImportData } from '../types/imported.js';
import { findLabel, valueOf, parseJapaneseDate, parseDateRange } from './excel-utils.js';
import { buildGrid, parseXlsxWithStdlib } from './xlsx-stdlib.js';

function norm(s: string): string {
  return (s || '').replace(/[\s\u3000]+/g, '').trim();
}

// Find anchor whose normalized cell value exactly equals the label (safer than substring).
function findLabelExact(grid: string[][], label: string): { row: number; col: number } | null {
  const target = norm(label);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      if (norm(grid[r][c] || '') === target) return { row: r, col: c };
    }
  }
  return null;
}

// Read the value to the right of an anchor, skipping cells that merge-propagated the same label text.
function valueRightOf(grid: string[][], anchor: { row: number; col: number }): string {
  const row = grid[anchor.row] || [];
  const anchorVal = norm(row[anchor.col] || '');
  for (let c = anchor.col + 1; c < row.length; c++) {
    const v = (row[c] || '').trim();
    if (v && norm(v) !== anchorVal) return v;
  }
  return '';
}

function findSheetIndex(sheets: Array<{ name: string }>, patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = sheets.findIndex(s => p.test(s.name.replace(/[\s\u3000]/g, '')));
    if (idx >= 0) return idx;
  }
  return -1;
}

function textBelow(grid: string[][], label: { row: number; col: number }, maxRows = 12): string {
  // Collect text in rows below the label anchor until we hit another section label.
  const lines: string[] = [];
  const labelNorm = norm(grid[label.row]?.[label.col] || '');
  const stopRe = /^(介護認定審査会|総合的な援助|生活援助中心|利用者及び家族|第[0-9０-９]+表|作成年月日|被保険者|要介護状態|計画作成|認定日|利用者名)/;
  for (let r = label.row + 1; r < Math.min(grid.length, label.row + 1 + maxRows); r++) {
    const row = grid[r] || [];
    const first = (row[0] || '').trim();
    if (first && stopRe.test(first)) break;
    // Pick the first non-empty cell that isn't merge-propagated label text
    let picked = '';
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim();
      if (!cell) continue;
      if (norm(cell) === labelNorm) continue;
      picked = cell; break;
    }
    if (picked && !lines.includes(picked)) lines.push(picked);
  }
  return lines.join('\n').trim();
}

function extractWishBlock(text: string, label: string): string {
  if (!text) return '';
  // Match 【本人の意向】 ... until next 【...】 or end
  const re = new RegExp(`【${label}】\\s*([\\s\\S]*?)(?=【[^】]+】|$)`);
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

function extractCareLevel(s: string): string {
  if (!s) return '';
  const bracket = /【\s*(要介護\s*[0-9０-９]|要支援\s*[0-9０-９]|自立)\s*】/.exec(s);
  if (bracket) return bracket[1].replace(/\s+/g, '');
  const mark = /■\s*(要介護\s*[0-9０-９]|要支援\s*[0-9０-９]|自立)/.exec(s);
  if (mark) return mark[1].replace(/\s+/g, '');
  return '';
}

function parseTable1(grid: string[][]): Record<string, any> {
  const out: Record<string, any> = {};
  const labelMap: Record<string, string[]> = {
    // Use exact-normalized label candidates; first match wins.
    userName: ['利用者名'],
    birthDate: ['生年月日'],
    address: ['住所'],
    insuredNumber: ['被保険者番号'],
    insurerNumber: ['保険者番号'],
    office: ['居宅介護支援事業者・事業所名及び所在地', '事業所名及び所在地'],
    creatorName: ['居宅サービス計画作成者氏名', '計画作成担当者名'],
    createdDate: ['計画作成(変更)日', '計画作成（変更）日', '計画作成日'],
    firstCreatedDate: ['初回居宅サービス計画作成日'],
    certDate: ['認定日'],
    certPeriod: ['認定の有効期間'],
    careLevel: ['要介護状態区分'],
  };

  for (const [key, candidates] of Object.entries(labelMap)) {
    for (const label of candidates) {
      const a = findLabelExact(grid, label);
      if (!a) continue;
      const v = valueRightOf(grid, a);
      if (v) { out[key] = v; break; }
    }
  }
  if (out.userName) out.userName = String(out.userName).replace(/\s*殿$/, '').trim();
  if (out.birthDate) out.birthDate = parseJapaneseDate(String(out.birthDate));
  if (out.careLevel) out.careLevel = extractCareLevel(String(out.careLevel)) || String(out.careLevel);
  if (out.certPeriod) {
    const r = parseDateRange(String(out.certPeriod));
    out.certPeriod = { raw: String(out.certPeriod), fromIso: r.fromIso, toIso: r.toIso };
  }

  // Multi-row text blocks (label on own row, content below)
  const aAssess = findLabel(grid, '利用者及び家族の生活に対する意向');
  const aCommittee = findLabel(grid, '介護認定審査会の意見');
  const aPolicy = findLabel(grid, '総合的な援助の方針');
  const aLiving = findLabel(grid, '生活援助中心型の算定理由');
  out.assessmentResult = aAssess ? textBelow(grid, aAssess, 8) : '';
  out.committeeOpinion = aCommittee ? textBelow(grid, aCommittee, 4) : '';
  out.totalPolicy = aPolicy ? textBelow(grid, aPolicy, 8) : '';
  out.livingSupportReason = aLiving ? textBelow(grid, aLiving, 4) : '';

  // Derive user/family wishes from the 課題分析 text
  out.userWishes = extractWishBlock(out.assessmentResult || '', '本人の意向');
  out.familyWishes = extractWishBlock(out.assessmentResult || '', '家族の意向');
  return out;
}

function parseTable2(sheet: { maxRow: number; maxCol: number; cells: any[]; merges: any[] }, grid: string[][]): any[] {
  // Find header row: a row that contains 'ニーズ' or '長期目標'
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const joined = (grid[r] || []).map(norm).join('|');
    if (joined.includes('ニーズ') || (joined.includes('長期目標') && joined.includes('短期目標'))) {
      headerRow = r; break;
    }
  }
  if (headerRow < 0) return [];

  // Figure out column mapping by scanning two header rows
  const h1 = grid[headerRow] || [];
  const h2 = grid[headerRow + 1] || [];
  const cols = { no: -1, need: -1, longGoal: -1, longPeriod: -1, shortGoal: -1, shortPeriod: -1, content: -1, insurance: -1, kind: -1, provider: -1, frequency: -1, period: -1 };
  for (let c = 0; c < Math.max(h1.length, h2.length); c++) {
    const a = norm(h1[c] || ''); const b = norm(h2[c] || '');
    const joined = `${a}/${b}`;
    if (/No|番号/i.test(joined) && cols.no < 0) cols.no = c;
    if (joined.includes('ニーズ')) cols.need = c;
    if (joined.includes('長期目標') && !joined.includes('期間')) cols.longGoal = c;
    if (joined.includes('短期目標') && !joined.includes('期間')) cols.shortGoal = c;
    if (joined.includes('サービス内容')) cols.content = c;
    if (joined.includes('サービス種別')) cols.kind = c;
    if (/頻度/.test(joined)) cols.frequency = c;
  }
  // Secondary scan in h2 for period/insurance/provider/period
  for (let c = 0; c < h2.length; c++) {
    const b = norm(h2[c] || '');
    if (b === '期間' && cols.longPeriod < 0 && cols.longGoal >= 0 && c > cols.longGoal) cols.longPeriod = c;
    else if (b === '期間' && cols.shortPeriod < 0 && cols.shortGoal >= 0 && c > cols.shortGoal) cols.shortPeriod = c;
    else if (b === '期間' && cols.period < 0) cols.period = c;
  }
  if (cols.longPeriod < 0 && cols.longGoal >= 0) cols.longPeriod = cols.longGoal + 1;
  if (cols.shortPeriod < 0 && cols.shortGoal >= 0) cols.shortPeriod = cols.shortGoal + 1;
  if (cols.insurance < 0 && cols.content >= 0) cols.insurance = cols.content + 1;
  if (cols.provider < 0 && cols.kind >= 0) cols.provider = cols.kind + 1;
  if (cols.period < 0 && cols.frequency >= 0) cols.period = cols.frequency + 1;

  // Parse merges on No column to group rows per need
  const noCol = cols.no >= 0 ? cols.no + 1 : 1; // 1-indexed for merges
  const dataStart = headerRow + 2; // below two header rows
  const groups: Array<{ startRow: number; endRow: number }> = [];
  const usedRows = new Set<number>();
  const mergeMap = new Map<number, number>(); // 0-indexed start row -> end row
  for (const m of sheet.merges || []) {
    if (m.c1 === noCol && m.c2 === noCol) {
      mergeMap.set(m.r1 - 1, m.r2 - 1);
    }
  }
  for (let r = dataStart; r < grid.length; r++) {
    if (usedRows.has(r)) continue;
    const noVal = norm(grid[r]?.[cols.no >= 0 ? cols.no : 0] || '');
    const needVal = norm(grid[r]?.[cols.need] || '');
    if (!noVal && !needVal) continue;
    if (!noVal) continue; // rows without No are continuations, handled via merges
    const end = mergeMap.get(r) ?? r;
    groups.push({ startRow: r, endRow: end });
    for (let k = r; k <= end; k++) usedRows.add(k);
  }

  const needs: any[] = [];
  for (const g of groups) {
    const row0 = grid[g.startRow] || [];
    const services: any[] = [];
    for (let r = g.startRow; r <= g.endRow; r++) {
      const row = grid[r] || [];
      const content = (row[cols.content] || '').trim();
      const kind = (row[cols.kind] || '').trim();
      const provider = (row[cols.provider] || '').trim();
      if (!content && !kind && !provider) continue;
      const insuranceVal = (row[cols.insurance] || '').trim();
      const periodRaw = (row[cols.period] || '').trim();
      services.push({
        content,
        insurance: /○|◯|有|対象/.test(insuranceVal),
        kind,
        provider,
        frequency: (row[cols.frequency] || '').trim(),
        period: { raw: periodRaw, ...parseDateRange(periodRaw) },
      });
    }
    const longPeriodRaw = (row0[cols.longPeriod] || '').trim();
    const shortPeriodRaw = (row0[cols.shortPeriod] || '').trim();
    needs.push({
      no: parseInt((row0[cols.no >= 0 ? cols.no : 0] || '0').replace(/\D/g, ''), 10) || needs.length + 1,
      need: (row0[cols.need] || '').trim(),
      longGoal: (row0[cols.longGoal] || '').trim(),
      longGoalPeriod: { raw: longPeriodRaw, ...parseDateRange(longPeriodRaw) },
      shortGoal: (row0[cols.shortGoal] || '').trim(),
      shortGoalPeriod: { raw: shortPeriodRaw, ...parseDateRange(shortPeriodRaw) },
      services,
    });
  }
  return needs;
}

function parseTable3(grid: string[][]) {
  // Header row with 月-日 + 主な日常生活上の活動
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = (grid[r] || []).map(norm).join('|');
    if (row.includes('月') && row.includes('火') && row.includes('水') && row.includes('主な日常生活')) {
      headerRow = r; break;
    }
  }
  const result = { timeSlots: [] as any[], dailyActivities: '', weeklyExtraServices: '' };
  if (headerRow < 0) return result;
  const header = grid[headerRow] || [];
  const dayKeys: Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'> = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = ['月','火','水','木','金','土','日'];
  const dayCol: Record<string, number> = {};
  for (let c = 0; c < header.length; c++) {
    const v = norm(header[c]);
    const i = dayLabels.indexOf(v);
    if (i >= 0) dayCol[dayKeys[i]] = c;
  }
  const activityCol = header.findIndex(v => /主な日常生活/.test(norm(v)));

  let currentSection: '深夜'|'早朝'|'午前'|'午後'|'夜間'|'' = '';
  let dailyActivities = '';
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const first = (row[0] || '').trim();
    if (/週単位以外/.test(first)) {
      result.weeklyExtraServices = (row.slice(1).filter(Boolean)[0] || '').trim();
      break;
    }
    if (/^(深夜|早朝|午前|午後|夜間)$/.test(first)) currentSection = first as any;
    const time = (row[1] || '').trim();
    if (!time && !currentSection) continue;
    const byWeekday: Record<string, string> = { mon:'', tue:'', wed:'', thu:'', fri:'', sat:'', sun:'' };
    for (const [k, c] of Object.entries(dayCol)) byWeekday[k] = (row[c] || '').trim();
    if (activityCol >= 0 && !dailyActivities) {
      const act = (row[activityCol] || '').trim();
      if (act) dailyActivities = act;
    }
    result.timeSlots.push({ section: currentSection, time, byWeekday });
  }
  result.dailyActivities = dailyActivities;
  return result;
}

function parseTable4(grid: string[][]) {
  const out: Record<string, any> = {};
  const anchors: Array<[string, string]> = [
    ['date', '開催日'],
    ['place', '開催場所'],
    ['duration', '開催時間'],
    ['count', '開催回数'],
    ['userAttendance', '利用者本人'],
    ['familyAttendance', '家族の出席'],
  ];
  for (const [key, label] of anchors) {
    const a = findLabel(grid, label);
    if (a) out[key] = valueOf(grid, a, 'right');
  }
  // Attendees block
  const attendeeAnchor = findLabel(grid, '会議出席者');
  const attendees: Array<{ affiliation: string; name: string }> = [];
  if (attendeeAnchor) {
    for (let r = attendeeAnchor.row + 2; r < Math.min(grid.length, attendeeAnchor.row + 10); r++) {
      const row = grid[r] || [];
      const first = (row[0] || '').trim();
      if (/^検討|^結論|^残された/.test(first)) break;
      // Three pairs across: col0+col1, col2+col3, col4+col5
      for (let c = 0; c + 1 < row.length; c += 2) {
        const aff = (row[c] || '').trim();
        const nm = (row[c + 1] || '').trim();
        if (aff || nm) attendees.push({ affiliation: aff, name: nm });
      }
    }
  }
  out.attendees = attendees;
  const mapping: Array<[string, string]> = [
    ['discussedItems', '検討した項目'],
    ['discussionContent', '検討内容'],
    ['conclusion', '結論'],
    ['remainingTasks', '残された課題'],
  ];
  for (const [key, label] of mapping) {
    const a = findLabel(grid, label);
    out[key] = a ? valueOf(grid, a, 'right') : '';
  }
  return out;
}

function parseTable5(grid: string[][]): Array<{ date: string; item: string; content: string }> {
  // Find header with 年月日|項目|内容 possibly repeated (2 column pairs)
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const joined = (grid[r] || []).map(norm).join('|');
    if (joined.includes('年月日') && joined.includes('項目') && joined.includes('内容')) { headerRow = r; break; }
  }
  if (headerRow < 0) return [];
  const header = grid[headerRow] || [];
  // Identify pair column ranges
  const pairs: Array<{ dateCol: number; itemCol: number; contentCol: number }> = [];
  for (let c = 0; c < header.length; c++) {
    if (norm(header[c]) === '年月日') {
      const itemCol = c + 1 < header.length && /項目/.test(norm(header[c + 1])) ? c + 1 : -1;
      const contentCol = c + 2 < header.length && /内容/.test(norm(header[c + 2])) ? c + 2 : -1;
      if (itemCol >= 0 && contentCol >= 0) pairs.push({ dateCol: c, itemCol, contentCol });
    }
  }
  const entries: Array<{ date: string; item: string; content: string }> = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    for (const p of pairs) {
      const date = (row[p.dateCol] || '').trim();
      const item = (row[p.itemCol] || '').trim();
      const content = (row[p.contentCol] || '').trim();
      if (date || item || content) entries.push({ date, item, content });
    }
  }
  return entries;
}

function parseTable6(grid: string[][]): Array<Record<string, string>> {
  // 第6表 is typically サービス利用票 (monthly calendar)
  // Without a stable standard layout, just return header-row-keyed records
  if (!grid.length) return [];
  // Find first non-empty row as header
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    if ((grid[r] || []).some(v => (v || '').trim())) { headerRow = r; break; }
  }
  if (headerRow < 0) return [];
  const header = (grid[headerRow] || []).map(v => (v || '').trim());
  const rows: Array<Record<string, string>> = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const obj: Record<string, string> = {};
    let has = false;
    for (let c = 0; c < header.length; c++) {
      const k = header[c] || `col${c + 1}`;
      const v = (row[c] || '').trim();
      if (v) has = true;
      obj[k] = v;
    }
    if (has) rows.push(obj);
  }
  return rows;
}

function parseMonitoring(grid: string[][]) {
  const history: Array<{ date: string; result: string }> = [];
  const sessions: Array<{ no: number; values: Record<string, string> }> = [];
  if (!grid.length) return { history, sessions };

  // Phase 1: history table — look for header row "実施年月日 | 評価結果"
  let histHeader = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const joined = (grid[r] || []).map(norm).join('|');
    if (joined.includes('実施年月日') && joined.includes('評価結果')) { histHeader = r; break; }
  }
  if (histHeader >= 0) {
    for (let r = histHeader + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const first = (row[0] || '').trim();
      if (!first) break;
      if (/^■|^第.回/.test(first)) break;
      history.push({ date: first, result: (row[1] || '').trim() });
    }
  }

  // Phase 2: sessions — each begins with "■ 第N回モニタリング"
  let current: { no: number; values: Record<string, string> } | null = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const first = (row[0] || '').trim();
    const sessionMatch = /^■\s*第\s*([0-9０-９]+)\s*回モニタリング/.exec(first);
    if (sessionMatch) {
      if (current) sessions.push(current);
      const no = parseInt(sessionMatch[1].replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)), 10) || sessions.length + 1;
      current = { no, values: {} };
      continue;
    }
    if (!current) continue;
    if (/^■/.test(first)) { sessions.push(current); current = null; continue; }
    if (first && row.length > 1) {
      const value = (row[1] || '').trim();
      if (value) current.values[first] = value;
    }
  }
  if (current) sessions.push(current);

  return { history, sessions };
}

export async function parseCareplanWorkbook(buffer: Buffer): Promise<CareplanImportData> {
  const raw = await parseXlsxWithStdlib(buffer);

  const idx1 = findSheetIndex(raw.sheets, [/第[1１]表/, /居宅サービス計画書[(（]1[)）]/]);
  const idx2 = findSheetIndex(raw.sheets, [/第[2２]表/, /居宅サービス計画書[(（]2[)）]/]);
  const idx3 = findSheetIndex(raw.sheets, [/第[3３]表/, /週間サービス計画表/]);
  const idx4 = findSheetIndex(raw.sheets, [/第[4４]表/, /サービス担当者会議/]);
  const idx5 = findSheetIndex(raw.sheets, [/第[5５]表/, /居宅介護支援経過/]);
  const idx6 = findSheetIndex(raw.sheets, [/第[6６]表/, /サービス利用票/]);
  const idxMon = findSheetIndex(raw.sheets, [/モニタリング/]);

  const getGrid = (idx: number) => (idx >= 0 ? buildGrid(raw.sheets[idx]) : [[]]);

  const table1 = idx1 >= 0 ? parseTable1(getGrid(idx1)) : { userName: '', birthDate: {}, careLevel: '', office: '', assessmentResult: '', committeeOpinion: '', totalPolicy: '', livingSupportReason: '' };
  const table2 = idx2 >= 0 ? parseTable2(raw.sheets[idx2] as any, getGrid(idx2)) : [];
  const table3 = idx3 >= 0 ? parseTable3(getGrid(idx3)) : { timeSlots: [], dailyActivities: '', weeklyExtraServices: '' };
  const table4 = idx4 >= 0 ? parseTable4(getGrid(idx4)) : {};
  const table5 = idx5 >= 0 ? parseTable5(getGrid(idx5)) : [];
  const table6 = idx6 >= 0 ? parseTable6(getGrid(idx6)) : [];
  const monitoring = idxMon >= 0 ? parseMonitoring(getGrid(idxMon)) : { history: [], sessions: [] };

  return {
    sheets: raw.sheets.map(s => s.name),
    table1,
    table2,
    table3,
    table4,
    table5,
    table6,
    monitoring,
  } as CareplanImportData;
}
