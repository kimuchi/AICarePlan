/**
 * Google Sheets formatting helpers for care plan export.
 * Generates batchUpdate requests to reproduce the official 第1〜3表 layout.
 */
import { sheets_v4 } from 'googleapis';
import type {
  Table1Data, NeedItem, Table3Data,
  BusinessMode, UserInfo, PlanMeta, ScheduleEntry, DailyActivity
} from '../types/plan.js';

// ── Color constants ──
const WHITE = { red: 1, green: 1, blue: 1 };
const LIGHT_GRAY = { red: 0.941, green: 0.953, blue: 0.965 };
const DARK_BORDER = { red: 0.278, green: 0.341, blue: 0.412 };
const NAVY = { red: 0.059, green: 0.161, blue: 0.259 };
const YELLOW_BG = { red: 0.996, green: 0.953, blue: 0.780 };
const LIGHT_BLUE = { red: 0.859, green: 0.918, blue: 0.996 };
const LIGHT_GREEN = { red: 0.863, green: 0.988, blue: 0.906 };
const LIGHT_PURPLE = { red: 0.929, green: 0.914, blue: 0.992 };

type Req = sheets_v4.Schema$Request;

function border(style: string = 'SOLID', width: number = 1, color = DARK_BORDER): sheets_v4.Schema$Border {
  return { style, width, color };
}

function thinBorder(): sheets_v4.Schema$Border {
  return border('SOLID', 1);
}

function thickBorder(): sheets_v4.Schema$Border {
  return border('SOLID', 2, NAVY);
}

function cellData(
  value: string,
  opts: {
    bold?: boolean;
    fontSize?: number;
    bgColor?: sheets_v4.Schema$Color;
    fgColor?: sheets_v4.Schema$Color;
    hAlign?: string;
    vAlign?: string;
    wrap?: boolean;
  } = {}
): sheets_v4.Schema$CellData {
  return {
    userEnteredValue: { stringValue: value },
    userEnteredFormat: {
      textFormat: {
        fontFamily: 'Noto Sans JP',
        fontSize: opts.fontSize ?? 10,
        bold: opts.bold ?? false,
        ...(opts.fgColor ? { foregroundColor: opts.fgColor } : {}),
      },
      backgroundColor: opts.bgColor ?? WHITE,
      horizontalAlignment: (opts.hAlign ?? 'LEFT') as any,
      verticalAlignment: (opts.vAlign ?? 'MIDDLE') as any,
      wrapStrategy: opts.wrap !== false ? 'WRAP' : 'CLIP',
      borders: {
        top: thinBorder(),
        bottom: thinBorder(),
        left: thinBorder(),
        right: thinBorder(),
      },
    },
  };
}

function mergeReq(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number): Req {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      mergeType: 'MERGE_ALL',
    },
  };
}

function colWidth(sheetId: number, col: number, pixels: number): Req {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
      properties: { pixelSize: pixels },
      fields: 'pixelSize',
    },
  };
}

function rowHeight(sheetId: number, row: number, pixels: number): Req {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: row, endIndex: row + 1 },
      properties: { pixelSize: pixels },
      fields: 'pixelSize',
    },
  };
}

// ── Table 1 Export ──

export function buildTable1Requests(
  sheetId: number,
  table1: Table1Data,
  user: UserInfo,
  meta: PlanMeta,
  mode: BusinessMode
): { requests: Req[]; rowData: sheets_v4.Schema$RowData[] } {
  const requests: Req[] = [];
  const rowData: sheets_v4.Schema$RowData[] = [];

  const title = mode === 'shoki'
    ? '居宅サービス計画書（1） 兼小規模多機能型居宅介護計画書'
    : '居宅サービス計画書（1）';

  // 4列構成: A(ラベル180) B(値240) C(ラベル140) D(値520)
  const colWidths = [180, 240, 140, 520];
  colWidths.forEach((w, i) => requests.push(colWidth(sheetId, i, w)));

  let row = 0;

  // Row 0: タイトル行 — 第1表 | 居宅サービス計画書(1)... | 作成年月日
  rowData.push({ values: [
    cellData('第1表', { bold: true, fontSize: 12, bgColor: NAVY, fgColor: WHITE, hAlign: 'CENTER' }),
    cellData(title, { bold: true, fontSize: 13, hAlign: 'CENTER' }),
    cellData('', {}),
    cellData(`作成年月日 ${meta.createDate}`, { fontSize: 9, hAlign: 'RIGHT' }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 3));
  row++;

  // Row 1: 初回・継続 | 認定済・申請中 — 罫線付きボックスで表示
  rowData.push({ values: [
    cellData('', {}),
    cellData('', {}),
    cellData('初回 ・ 継続', { fontSize: 9, hAlign: 'CENTER', bold: true, bgColor: LIGHT_GRAY }),
    cellData('認定済 ・ 申請中', { fontSize: 9, hAlign: 'CENTER', bold: true, bgColor: LIGHT_GRAY }),
  ]});
  // 枠線を個別に設定
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 2, endColumnIndex: 3 },
      top: thickBorder(), bottom: thickBorder(), left: thickBorder(), right: thickBorder(),
    },
  });
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 3, endColumnIndex: 4 },
      top: thickBorder(), bottom: thickBorder(), left: thickBorder(), right: thickBorder(),
    },
  });
  row++;

  // Row 2: 利用者名 | 値 | 生年月日 | 値
  rowData.push({ values: [
    cellData('利用者名', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(`${user.name} 様`, { fontSize: 10 }),
    cellData('生年月日', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(user.birthDate || '', { fontSize: 10 }),
  ]});
  row++;

  // Row 3: 住所 | 値(3列結合)
  rowData.push({ values: [
    cellData('住所', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(user.address || '', { fontSize: 10 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  row++;

  // Row 4: 居宅サービス計画作成者氏名 | 値(3列結合)
  rowData.push({ values: [
    cellData('居宅サービス計画\n作成者氏名', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, wrap: true }),
    cellData(meta.creator, { fontSize: 10 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  row++;

  // Row 5: 居宅介護支援事業者・事業所名および所在地 | 値(3列結合)
  const facilityFull = meta.facilityAddress
    ? `${meta.facility}　${meta.facilityAddress}`
    : meta.facility;
  rowData.push({ values: [
    cellData('居宅介護支援事業者\n・事業所名\nおよび所在地', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, wrap: true }),
    cellData(facilityFull, { fontSize: 10 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  requests.push(rowHeight(sheetId, row, 40));
  row++;

  // Row 6: 居宅サービス計画作成(変更)日 | 値 | 初回居宅サービス計画作成日 | 値
  rowData.push({ values: [
    cellData('居宅サービス計画\n作成(変更)日', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, wrap: true }),
    cellData(meta.createDate, { fontSize: 10 }),
    cellData('初回居宅サービス\n計画作成日', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, wrap: true }),
    cellData(meta.firstCreateDate || '', { fontSize: 10 }),
  ]});
  row++;

  // Row 7: 認定日 | 値 | 認定の有効期間 | 値
  rowData.push({ values: [
    cellData('認定日', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(user.certDate || '', { fontSize: 10 }),
    cellData('認定の有効期間', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(`${user.certPeriod?.start || ''} 〜 ${user.certPeriod?.end || ''}`, { fontSize: 10 }),
  ]});
  row++;

  // Row 8: 要介護状態区分 | 値(3列結合)
  const careLevelStr = ['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5']
    .map(level => {
      const cl = (user.careLevel || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      return cl.includes(level.replace('要', '')) || cl === level ? `【${level}】` : level;
    })
    .join(' ・ ');
  rowData.push({ values: [
    cellData('要介護状態区分', { bold: true, bgColor: LIGHT_GRAY, fontSize: 10 }),
    cellData(careLevelStr, { fontSize: 9 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  row++;

  // Row 9: 利用者及び家族の意向... | 値(3列結合)
  const assessmentText = `${table1.userWishes}\n${table1.familyWishes}\n${table1.assessmentResult}`;
  rowData.push({ values: [
    cellData('利用者及び家族の\n生活に対する意向を\n踏まえた課題分析\nの結果', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, wrap: true }),
    cellData(assessmentText, { fontSize: 10, wrap: true }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  requests.push(rowHeight(sheetId, row, 150));
  row++;

  // Row 10: 介護認定審査会の意見... | 値(3列結合)
  rowData.push({ values: [
    cellData('介護認定審査会の\n意見及びサービス\nの種類の指定', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, wrap: true }),
    cellData(table1.committeeOpinion || '特になし', { fontSize: 10 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  row++;

  // Row 11: 総合的な援助の方針 | 値(3列結合)
  rowData.push({ values: [
    cellData('総合的な援助の\n方針', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, wrap: true }),
    cellData(table1.totalPolicy, { fontSize: 10, wrap: true }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  requests.push(rowHeight(sheetId, row, 200));
  row++;

  // Row 12: 生活援助中心型の算定理由 | 値(3列結合)
  rowData.push({ values: [
    cellData('生活援助中心型の\n算定理由', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, wrap: true }),
    cellData(table1.livingSupportReason || '', { fontSize: 10 }),
  ]});
  requests.push(mergeReq(sheetId, row, row + 1, 1, 4));
  row++;

  // Outer thick border
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: row, startColumnIndex: 0, endColumnIndex: 4 },
      top: thickBorder(),
      bottom: thickBorder(),
      left: thickBorder(),
      right: thickBorder(),
    },
  });

  return { requests, rowData };
}

// ── Table 2 Export ──

export function buildTable2Requests(
  sheetId: number,
  table2: NeedItem[],
  user: UserInfo,
  meta: PlanMeta,
  mode: BusinessMode
): { requests: Req[]; rowData: sheets_v4.Schema$RowData[] } {
  const requests: Req[] = [];
  const rowData: sheets_v4.Schema$RowData[] = [];

  const title = mode === 'shoki'
    ? '居宅サービス計画書（2） 兼小規模多機能型居宅介護計画書'
    : '居宅サービス計画書（2）';

  // Column widths (A-J: 10 columns)
  const colWidths = [160, 130, 70, 130, 70, 200, 30, 130, 120, 60, 70];
  colWidths.forEach((w, i) => requests.push(colWidth(sheetId, i, w)));

  // Row 0: Title — 第2表 + 正式表題 + 作成年月日
  rowData.push({
    values: [
      cellData('第2表', { bold: true, fontSize: 11, bgColor: NAVY, fgColor: WHITE, hAlign: 'CENTER' }),
      cellData(title, { bold: true, fontSize: 12, hAlign: 'CENTER' }),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData(`作成年月日 ${meta.createDate}`, { fontSize: 9, hAlign: 'RIGHT' }),
      cellData('', {}),
    ],
  });
  requests.push(mergeReq(sheetId, 0, 1, 1, 9));
  requests.push(mergeReq(sheetId, 0, 1, 9, 11));

  // Row 1: User name
  rowData.push({
    values: [
      cellData(`利用者名 ${user.name} 様`, { fontSize: 10 }),
    ],
  });
  requests.push(mergeReq(sheetId, 1, 2, 0, 4));

  // Row 2-3: Headers
  rowData.push({
    values: [
      cellData('生活全般の解決すべき\n課題（ニーズ）', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER', wrap: true }),
      cellData('長期目標', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('期間', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('短期目標', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('期間', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('サービス内容', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('※1', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, hAlign: 'CENTER' }),
      cellData('サービス種別', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('※2', { bold: true, bgColor: LIGHT_GRAY, fontSize: 8, hAlign: 'CENTER' }),
      cellData('頻度', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
      cellData('期間', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER' }),
    ],
  });

  let currentRow = 3;

  // Data rows
  for (const item of table2) {
    const totalServiceRows = item.goals.reduce((sum, g) => sum + g.services.length, 0);
    const needStartRow = currentRow;

    for (const goal of item.goals) {
      const goalStartRow = currentRow;

      for (const sv of goal.services) {
        rowData.push({
          values: [
            cellData(currentRow === needStartRow ? item.need : '', { fontSize: 9, bgColor: YELLOW_BG, wrap: true }),
            cellData(currentRow === goalStartRow ? goal.longGoal : '', { fontSize: 9, wrap: true }),
            cellData(currentRow === goalStartRow ? goal.longPeriod : '', { fontSize: 8, wrap: true }),
            cellData(currentRow === goalStartRow ? goal.shortGoal : '', { fontSize: 9, wrap: true }),
            cellData(currentRow === goalStartRow ? goal.shortPeriod : '', { fontSize: 8, wrap: true }),
            cellData(sv.content, { fontSize: 9, wrap: true }),
            cellData(sv.insurance, { fontSize: 9, hAlign: 'CENTER' }),
            cellData(sv.type, { fontSize: 9, wrap: true }),
            cellData(sv.provider, { fontSize: 9, wrap: true }),
            cellData(sv.frequency, { fontSize: 8, wrap: true }),
            cellData(sv.period, { fontSize: 8, wrap: true }),
          ],
        });
        requests.push(rowHeight(sheetId, currentRow, 60));
        currentRow++;
      }

      // Merge goal cells
      if (goal.services.length > 1) {
        requests.push(mergeReq(sheetId, goalStartRow, goalStartRow + goal.services.length, 1, 2));
        requests.push(mergeReq(sheetId, goalStartRow, goalStartRow + goal.services.length, 2, 3));
        requests.push(mergeReq(sheetId, goalStartRow, goalStartRow + goal.services.length, 3, 4));
        requests.push(mergeReq(sheetId, goalStartRow, goalStartRow + goal.services.length, 4, 5));
      }
    }

    // Merge need cell
    if (totalServiceRows > 1) {
      requests.push(mergeReq(sheetId, needStartRow, needStartRow + totalServiceRows, 0, 1));
    }
  }

  // Outer border
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: currentRow, startColumnIndex: 0, endColumnIndex: 11 },
      top: thickBorder(),
      bottom: thickBorder(),
      left: thickBorder(),
      right: thickBorder(),
    },
  });

  return { requests, rowData };
}

// ── Table 3 Export ──

const DAYS_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const TIME_SLOTS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; // 12 rows, 2h each
const PERIOD_MAP: Record<string, string> = {
  '0': '深夜', '2': '深夜', '4': '深夜',
  '6': '早朝',
  '8': '午前', '10': '午前',
  '12': '午後', '14': '午後', '16': '午後',
  '18': '夜間', '20': '夜間',
  '22': '深夜',
};

function getServiceColor(label: string): sheets_v4.Schema$Color {
  if (label.includes('通い')) return LIGHT_BLUE;
  if (label.includes('訪問')) return LIGHT_GREEN;
  if (label.includes('泊まり')) return LIGHT_PURPLE;
  return LIGHT_GRAY;
}

export function buildTable3Requests(
  sheetId: number,
  table3: Table3Data,
  user: UserInfo,
  meta: PlanMeta
): { requests: Req[]; rowData: sheets_v4.Schema$RowData[] } {
  const requests: Req[] = [];
  const rowData: sheets_v4.Schema$RowData[] = [];

  // Column widths: period(40) + time(50) + 7 days(100 each) + activities(180) = 10 cols
  const colWidths = [40, 55, 100, 100, 100, 100, 100, 100, 100, 180];
  colWidths.forEach((w, i) => requests.push(colWidth(sheetId, i, w)));

  // Row 0: Title — 第3表 + 週間サービス計画表 + 作成年月日
  rowData.push({
    values: [
      cellData('第3表', { bold: true, fontSize: 11, bgColor: NAVY, fgColor: WHITE, hAlign: 'CENTER' }),
      cellData('週間サービス計画表', { bold: true, fontSize: 14, hAlign: 'CENTER' }),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData('', {}),
      cellData(`作成年月日 ${meta.createDate}`, { fontSize: 9, hAlign: 'RIGHT' }),
      cellData('', {}),
    ],
  });
  requests.push(mergeReq(sheetId, 0, 1, 1, 8));
  requests.push(mergeReq(sheetId, 0, 1, 8, 10));

  // Row 1: User name
  rowData.push({
    values: [
      cellData(`利用者名：${user.name} 様`, { fontSize: 10 }),
    ],
  });
  requests.push(mergeReq(sheetId, 1, 2, 0, 4));

  // Row 2: Day headers
  rowData.push({
    values: [
      cellData('', { bgColor: LIGHT_GRAY }),
      cellData('', { bgColor: LIGHT_GRAY }),
      ...DAY_LABELS.map(d => cellData(d, { bold: true, bgColor: LIGHT_GRAY, hAlign: 'CENTER', fontSize: 11 })),
      cellData('主な日常生活上の活動', { bold: true, bgColor: LIGHT_GRAY, hAlign: 'CENTER', fontSize: 9 }),
    ],
  });

  // Build schedule lookup: 各サービスが重なる全セルを計算
  // key: "day-hour" → { entry, isFirst } （isFirst = 開始セルのみラベル表示）
  const scheduleLookup = new Map<string, { entry: ScheduleEntry; isFirst: boolean }>();
  for (const s of table3.schedule) {
    const sStart = s.startHour + s.startMin / 60;
    const sEnd = s.endHour + s.endMin / 60;
    for (const slot of TIME_SLOTS) {
      const slotEnd = slot + 2;
      if (sStart < slotEnd && sEnd > slot) {
        const key = `${s.day}-${slot}`;
        // 開始セル（最初の重なりセル）にだけラベルを表示
        const isFirst = slot === Math.floor(s.startHour / 2) * 2;
        if (!scheduleLookup.has(key)) {
          scheduleLookup.set(key, { entry: s, isFirst });
        }
      }
    }
  }

  // Build daily activity lookup: hour -> activity
  const activityLookup = new Map<number, DailyActivity>();
  for (const a of table3.dailyActivities) {
    const h = parseInt(a.time.split(':')[0], 10);
    const slot = Math.floor(h / 2) * 2;
    activityLookup.set(slot, a);
  }

  // Period tracking for merge
  let currentPeriod = '';
  let periodStartRow = 3;

  TIME_SLOTS.forEach((hour, idx) => {
    const period = PERIOD_MAP[String(hour)];
    const rowIndex = 3 + idx;

    // Period column
    const isNewPeriod = period !== currentPeriod;
    if (isNewPeriod && currentPeriod !== '' && idx > 0) {
      // Merge previous period cells
      requests.push(mergeReq(sheetId, periodStartRow, rowIndex, 0, 1));
      periodStartRow = rowIndex;
    }
    if (isNewPeriod) {
      currentPeriod = period;
      if (idx === 0) periodStartRow = rowIndex;
    }

    const dayCells = DAYS_ORDER.map(day => {
      const key = `${day}-${hour}`;
      const hit = scheduleLookup.get(key);
      if (hit) {
        const { entry, isFirst } = hit;
        if (isFirst) {
          // 開始セル: ラベル + 時間帯を表示
          const timeStr = `${String(entry.startHour).padStart(2, '0')}:${String(entry.startMin).padStart(2, '0')}〜${String(entry.endHour).padStart(2, '0')}:${String(entry.endMin).padStart(2, '0')}`;
          return cellData(`${entry.label}\n${timeStr}`, {
            fontSize: 9, hAlign: 'CENTER', bgColor: getServiceColor(entry.label), wrap: true,
          });
        } else {
          // 継続セル: 色だけ（ラベルなし）
          return cellData('', { bgColor: getServiceColor(entry.label) });
        }
      }
      return cellData('', {});
    });

    const activity = activityLookup.get(hour);
    const actText = activity ? `${activity.time}…${activity.activity}` : '';

    rowData.push({
      values: [
        cellData(isNewPeriod ? period : '', { bold: true, bgColor: LIGHT_GRAY, hAlign: 'CENTER', fontSize: 10 }),
        cellData(`${String(hour).padStart(2, '0')}:00`, { fontSize: 9, bgColor: { red: 0.98, green: 0.984, blue: 0.988 } }),
        ...dayCells,
        cellData(actText, { fontSize: 9 }),
      ],
    });
    requests.push(rowHeight(sheetId, rowIndex, 42));
  });

  // Final period merge
  if (currentPeriod !== '') {
    requests.push(mergeReq(sheetId, periodStartRow, 3 + TIME_SLOTS.length, 0, 1));
  }

  // Weekly service row
  const weeklyRow = 3 + TIME_SLOTS.length;
  rowData.push({
    values: [
      cellData('週単位以外\nのサービス', { bold: true, bgColor: LIGHT_GRAY, fontSize: 9, hAlign: 'CENTER', wrap: true }),
      cellData('', {}),
      cellData(table3.weeklyService, { fontSize: 10 }),
    ],
  });
  requests.push(mergeReq(sheetId, weeklyRow, weeklyRow + 1, 0, 2));
  requests.push(mergeReq(sheetId, weeklyRow, weeklyRow + 1, 2, 10));

  // Outer border
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: weeklyRow + 1, startColumnIndex: 0, endColumnIndex: 10 },
      top: thickBorder(),
      bottom: thickBorder(),
      left: thickBorder(),
      right: thickBorder(),
    },
  });

  return { requests, rowData };
}
