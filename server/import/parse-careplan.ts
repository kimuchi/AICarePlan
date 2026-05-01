/**
 * ケアプラン Excel パーサー（第1〜5表 + モニタリング）。
 *
 * 設計方針:
 * - すべてラベルアンカー駆動。セル番地は固定しない。
 * - 結合セルは normalizeSheet が左上値を投影してくれるので grid を素直に走査する。
 * - 1シートのパース失敗が他シートに波及しないよう、各シートを try/catch で包む。
 * - 警告は warnings に蓄積し、致命でない限り throw しない。
 */

import ExcelJS from 'exceljs';
import {
  normalizeSheet,
  findLabel,
  findAllLabels,
  valueOf,
  parseJapaneseDate,
  parseDateRange,
  extractBracketed,
  extractSelected,
  parseSelectionGroup,
  normLabel,
  type NormalizedSheet,
} from './excel-utils.js';
import type {
  ImportedCareplan,
  ExcelTable1,
  ExcelTable2,
  ExcelT2Need,
  ExcelT2Service,
  ExcelTable3,
  ExcelT3TimeSlot,
  Weekday,
  ExcelTable4,
  ExcelT4Attendee,
  ExcelTable5,
  ExcelT5Record,
  ExcelMonitoring,
  MonitoringHistoryRow,
  MonitoringSession,
  DateValue,
} from '../types/imported.js';

// ── ヘルパ ──

function dateValue(raw: string): DateValue {
  const r = String(raw || '').trim();
  if (!r) return { raw: '' };
  const parsed = parseJapaneseDate(r);
  return {
    raw: r,
    iso: parsed.iso,
    wareki: parsed.wareki,
    age: parsed.age,
  };
}

function findSheet(wb: ExcelJS.Workbook, candidates: RegExp[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    for (const re of candidates) {
      if (re.test(ws.name)) return ws;
    }
  }
  return null;
}

function emptyTable1(): ExcelTable1 {
  return {
    createDate: { raw: '' },
    userName: '',
    userNameRaw: '',
    birthDate: { raw: '' },
    address: '',
    insuredNumber: '',
    insurerNumber: '',
    plannerName: '',
    supportOfficeAndAddress: '',
    planCreateDate: { raw: '' },
    firstPlanCreateDate: { raw: '' },
    certDate: { raw: '' },
    certPeriod: { raw: '' },
    userAndFamilyWishes: '',
    committeeOpinion: '',
    totalPolicy: '',
    livingSupportReason: '',
  };
}

function emptyTable3(): ExcelTable3 {
  return {
    weekdayOrder: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    timeSlots: [],
    dailyActivities: '',
    weeklyExtraServices: '',
  };
}

function emptyTable4(): ExcelTable4 {
  return {
    userName: '',
    plannerName: '',
    heldDate: { raw: '' },
    location: '',
    heldTime: '',
    session: '',
    attendees: [],
    discussedItems: '',
    discussion: '',
    conclusion: '',
    remainingTasks: '',
  };
}

// ── 第1表 ──

function parseTable1(ws: ExcelJS.Worksheet, warnings: string[]): ExcelTable1 {
  const t1 = emptyTable1();
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // 作成年月日（最上段、ラベル「作成年月日」直右）
    const createAnchor = findLabel(g, '作成年月日');
    if (createAnchor) t1.createDate = dateValue(valueOf(g, createAnchor, 'right'));

    // 計画区分（初回/紹介/継続）— 行2付近の「【 X 】 ・ ...」
    const planKindAnchor = findLabel(g, '初回');
    if (planKindAnchor) {
      const cell = g[planKindAnchor.row][planKindAnchor.col];
      const sel = extractBracketed(cell);
      if (sel) t1.planKind = sel;
    }
    // 認定済/申請中
    const certKindAnchor = findLabel(g, '認定済');
    if (certKindAnchor) {
      const cell = g[certKindAnchor.row][certKindAnchor.col];
      const sel = extractBracketed(cell);
      if (sel) t1.certStatus = sel;
    }

    // 利用者名
    const userAnchor = findLabel(g, '利用者名');
    if (userAnchor) {
      const raw = valueOf(g, userAnchor, 'right');
      t1.userNameRaw = raw;
      t1.userName = raw.replace(/殿\s*$/, '').trim();
    }

    // 生年月日
    const birthAnchor = findLabel(g, '生年月日');
    if (birthAnchor) t1.birthDate = dateValue(valueOf(g, birthAnchor, 'right'));

    // 住所
    const addrAnchor = findLabel(g, '住所');
    if (addrAnchor) t1.address = valueOf(g, addrAnchor, 'right');

    // 被保険者番号
    const insuredAnchor = findLabel(g, '被保険者番号');
    if (insuredAnchor) t1.insuredNumber = valueOf(g, insuredAnchor, 'right');

    // 保険者番号
    const insurerAnchor = findLabel(g, '保険者番号');
    if (insurerAnchor) t1.insurerNumber = valueOf(g, insurerAnchor, 'right');

    // 計画作成者氏名
    const plannerAnchor = findLabel(g, '居宅サービス計画');
    if (plannerAnchor) {
      // 同じ行の右側で「（計画作成担当者名）」等をピックアップ
      const v = valueOf(g, plannerAnchor, 'right');
      t1.plannerName = v;
    }

    // 居宅介護支援事業者
    const officeAnchor = findLabel(g, '居宅介護支援事業者');
    if (officeAnchor) t1.supportOfficeAndAddress = valueOf(g, officeAnchor, 'right');

    // 計画作成（変更）日
    const planCreateAnchor = findLabel(g, '計画作成');
    if (planCreateAnchor) {
      // ラベル自体に「計画作成\n(変更)日」の塊が入ることがある。同じ行で右に拾う。
      t1.planCreateDate = dateValue(valueOf(g, planCreateAnchor, 'right'));
    }

    // 初回居宅サービス計画作成日
    const firstPlanAnchor = findLabel(g, '初回居宅サービス');
    if (firstPlanAnchor) t1.firstPlanCreateDate = dateValue(valueOf(g, firstPlanAnchor, 'right'));

    // 認定日
    const certDateAnchor = findLabel(g, '認定日');
    if (certDateAnchor) t1.certDate = dateValue(valueOf(g, certDateAnchor, 'right'));

    // 認定の有効期間
    const certPeriodAnchor = findLabel(g, '認定の有効期間');
    if (certPeriodAnchor) {
      const v = valueOf(g, certPeriodAnchor, 'right');
      t1.certPeriod = parseDateRange(v);
    }

    // 要介護状態区分
    const careAnchor = findLabel(g, '要介護状態区分');
    if (careAnchor) {
      const v = valueOf(g, careAnchor, 'right');
      const br = extractBracketed(v);
      if (br) t1.careLevel = br;
    }

    // 利用者及び家族の生活に対する意向
    const wishesAnchor = findLabel(g, '利用者及び家族');
    if (wishesAnchor) {
      // ラベルセルの直下に本文（結合済み）
      const r = wishesAnchor.row + 1;
      if (g[r]) t1.userAndFamilyWishes = g[r][wishesAnchor.col] || '';
    }

    // 介護認定審査会の意見
    const committeeAnchor = findLabel(g, '介護認定審査会');
    if (committeeAnchor) {
      const r = committeeAnchor.row + 1;
      if (g[r]) t1.committeeOpinion = g[r][committeeAnchor.col] || '';
    }

    // 総合的な援助の方針
    const policyAnchor = findLabel(g, '総合的な援助の方針');
    if (policyAnchor) {
      const r = policyAnchor.row + 1;
      if (g[r]) t1.totalPolicy = g[r][policyAnchor.col] || '';
    }

    // 生活援助中心型の算定理由
    const livingAnchor = findLabel(g, '生活援助中心型');
    if (livingAnchor) t1.livingSupportReason = valueOf(g, livingAnchor, 'right');
  } catch (e) {
    warnings.push(`第1表 parse 失敗: ${(e as Error).message}`);
  }
  return t1;
}

// ── 第2表 ──

function parseTable2(ws: ExcelJS.Worksheet, warnings: string[]): ExcelTable2 {
  const out: ExcelT2Need[] = [];
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // ヘッダ行を検出: 「No」「ニーズ」「長期目標」「短期目標」「サービス内容」を含む2行
    const noAnchor = findLabel(g, 'No', { partial: false });
    if (!noAnchor) {
      warnings.push('第2表 ヘッダ行が見つからない');
      return out;
    }
    // ヘッダ行は noAnchor.row 〜 noAnchor.row+1 の2行構成
    const headerTop = noAnchor.row;
    // ヘッダ2行目の各カラム位置を特定する
    const findInRow = (rowIdx: number, label: string): number | null => {
      const row = g[rowIdx] || [];
      const key = normLabel(label);
      for (let c = 1; c < row.length; c++) {
        if (normLabel(row[c]).includes(key)) return c;
      }
      return null;
    };
    const subRow = headerTop + 1;
    const colNo = noAnchor.col;
    const colNeed = findInRow(headerTop, 'ニーズ') ?? findInRow(subRow, 'ニーズ') ?? colNo + 1;
    const colLongGoal = findInRow(subRow, '長期目標') ?? colNeed + 1;
    const colLongPeriod = findInRow(subRow, '（期間）') ?? colLongGoal + 1;
    const colShortGoal = findInRow(subRow, '短期目標') ?? colLongPeriod + 1;
    const colShortPeriod = colShortGoal + 1;
    const colContent =
      findInRow(subRow, 'サービス内容') ?? colShortPeriod + 1;
    const colInsurance = findInRow(subRow, '※1') ?? colContent + 1;
    const colKind = findInRow(subRow, 'サービス種別') ?? colInsurance + 1;
    const colProvider = (findInRow(subRow, '※2') ?? colKind + 1) + 0;
    // 実データを見ると「※2」のラベル行がない場合、provider=kind+1。
    const colFreq = findInRow(subRow, '頻度') ?? colProvider + 1;
    const colPeriod = findInRow(subRow, '期間') ?? colFreq + 1;

    // データ行: subRow+1 から末尾まで
    let curNeed: ExcelT2Need | null = null;
    let prevNo = '';
    for (let r = subRow + 1; r <= ns.rowCount; r++) {
      const row = g[r];
      if (!row) continue;
      const noCell = (row[colNo] || '').trim();
      const needCell = (row[colNeed] || '').trim();
      const contentCell = (row[colContent] || '').trim();
      // 完全空行はスキップ
      if (!noCell && !needCell && !contentCell) continue;
      // No が変わったら新しいニーズ
      const isNewNeed = !!noCell && noCell !== prevNo;
      if (isNewNeed || !curNeed) {
        const noInt = parseInt(noCell, 10);
        curNeed = {
          no: Number.isFinite(noInt) ? noInt : out.length + 1,
          need: needCell,
          longGoal: (row[colLongGoal] || '').trim(),
          longGoalPeriod: parseDateRange((row[colLongPeriod] || '').trim()),
          shortGoal: (row[colShortGoal] || '').trim(),
          shortGoalPeriod: parseDateRange((row[colShortPeriod] || '').trim()),
          services: [],
        };
        out.push(curNeed);
        prevNo = noCell;
      }
      // service 行を追加（サービス内容が空でも※1や種別があれば追加）
      const service: ExcelT2Service = {
        content: contentCell,
        insurance: /[○◯]/.test((row[colInsurance] || '').trim()),
        kind: (row[colKind] || '').trim(),
        provider: (row[colProvider] || '').trim(),
        frequency: (row[colFreq] || '').trim(),
        period: parseDateRange((row[colPeriod] || '').trim()),
      };
      if (
        service.content ||
        service.kind ||
        service.provider ||
        service.frequency
      ) {
        curNeed.services.push(service);
      }
    }
  } catch (e) {
    warnings.push(`第2表 parse 失敗: ${(e as Error).message}`);
  }
  return out;
}

// ── 第3表 ──

function parseTable3(ws: ExcelJS.Worksheet, warnings: string[]): ExcelTable3 {
  const t3 = emptyTable3();
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // 「時 間」ヘッダ行を見つける
    const timeAnchor = findLabel(g, '時間');
    if (!timeAnchor) {
      warnings.push('第3表 「時間」ヘッダが見つからない');
      return t3;
    }
    const headerRow = timeAnchor.row;
    // 同じ行で曜日ヘッダ（月火水木金土日）を探す
    const weekdayMap: Record<string, Weekday> = {
      月: 'mon',
      火: 'tue',
      水: 'wed',
      木: 'thu',
      金: 'fri',
      土: 'sat',
      日: 'sun',
    };
    const weekdayCols: Array<{ col: number; key: Weekday }> = [];
    const headerCells = g[headerRow] || [];
    for (let c = timeAnchor.col + 1; c < headerCells.length; c++) {
      const v = (headerCells[c] || '').trim();
      if (weekdayMap[v]) weekdayCols.push({ col: c, key: weekdayMap[v] });
    }
    if (weekdayCols.length > 0) {
      t3.weekdayOrder = weekdayCols.map((w) => w.key);
    }

    // 「主な日常生活上の活動」列
    const dailyAnchor = findLabel(g, '主な日常生活上の活動');
    const dailyCol = dailyAnchor?.col ?? null;

    // 時間帯行: ヘッダの下 → 「週単位以外のサービス」の手前まで
    const weeklyAnchor = findLabel(g, '週単位以外');
    const dataEndRow = weeklyAnchor ? weeklyAnchor.row - 1 : ns.rowCount;
    const dataStartRow = headerRow + 1;

    // section列(深夜/早朝/午前/午後/夜間)はラベル列、time列はその次
    const sectionCol = timeAnchor.col;
    const timeCol = sectionCol + 1;

    for (let r = dataStartRow; r <= dataEndRow; r++) {
      const row = g[r];
      if (!row) continue;
      const time = (row[timeCol] || '').trim();
      const section = (row[sectionCol] || '').trim();
      if (!time) continue;
      const slot: ExcelT3TimeSlot = {
        section,
        time,
        byWeekday: {
          mon: '',
          tue: '',
          wed: '',
          thu: '',
          fri: '',
          sat: '',
          sun: '',
        },
      };
      for (const w of weekdayCols) {
        slot.byWeekday[w.key] = (row[w.col] || '').trim();
      }
      t3.timeSlots.push(slot);
    }

    // 主な日常生活上の活動 (dailyCol はマージで全行同値になっているので最初の行から取る)
    if (dailyCol != null) {
      const v = (g[dataStartRow]?.[dailyCol] || '').trim();
      t3.dailyActivities = v;
    }
    // 週単位以外のサービス (weeklyAnchor の右の最初の非空)
    if (weeklyAnchor) {
      t3.weeklyExtraServices = valueOf(g, weeklyAnchor, 'right');
    }
  } catch (e) {
    warnings.push(`第3表 parse 失敗: ${(e as Error).message}`);
  }
  return t3;
}

// ── 第4表 ──

function parseTable4(ws: ExcelJS.Worksheet, warnings: string[]): ExcelTable4 {
  const t4 = emptyTable4();
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // 利用者名: ヘッダ2行目「利用者名: XXX 殿」
    const userAnchor = findLabel(g, '利用者名:');
    if (userAnchor) {
      const cell = g[userAnchor.row][userAnchor.col];
      const m = /利用者名\s*[:：]\s*(.+?)\s*殿?\s*$/.exec(cell);
      if (m) t4.userName = m[1].replace(/殿\s*$/, '').trim();
    }
    // 計画作成者
    const plannerAnchor = findLabel(g, '居宅サービス計画作成者氏名');
    if (plannerAnchor) {
      const cell = g[plannerAnchor.row][plannerAnchor.col];
      const m = /[:：]\s*(.+)$/.exec(cell);
      if (m) t4.plannerName = m[1].trim();
    }

    // 開催日
    const heldDateAnchor = findLabel(g, '開催日');
    if (heldDateAnchor) t4.heldDate = dateValue(valueOf(g, heldDateAnchor, 'right'));

    // 開催場所
    const locAnchor = findLabel(g, '開催場所');
    if (locAnchor) t4.location = valueOf(g, locAnchor, 'right');

    // 開催時間
    const timeAnchor = findLabel(g, '開催時間');
    if (timeAnchor) t4.heldTime = valueOf(g, timeAnchor, 'right');

    // 開催回数
    const sessionAnchor = findLabel(g, '開催回数');
    if (sessionAnchor) t4.session = valueOf(g, sessionAnchor, 'right');

    // 利用者本人の出席
    const userAttendAnchor = findLabel(g, '利用者本人');
    if (userAttendAnchor) {
      const v = valueOf(g, userAttendAnchor, 'right');
      const br = extractBracketed(v);
      t4.userAttended = br || v;
    }
    // 家族の出席
    const famAttendAnchor = findLabel(g, '家族の出席');
    if (famAttendAnchor) {
      const v = valueOf(g, famAttendAnchor, 'right');
      const br = extractBracketed(v);
      t4.familyAttended = br || v;
    }

    // 会議出席者: ヘッダ「所属（職種）」「氏名」を持つ表を読み出す
    const attendHeaderAnchor = findLabel(g, '所属');
    if (attendHeaderAnchor) {
      const headerRow = attendHeaderAnchor.row;
      // 行構造: その行に複数の「所属…」「氏名」ペアがある (row 8 のように)
      // 各ペアを列で識別
      const pairs: Array<{ roleCol: number; nameCol: number }> = [];
      const headerCells = g[headerRow] || [];
      for (let c = 1; c < headerCells.length; c++) {
        if (/所属/.test(headerCells[c] || '')) {
          // 直後の「氏名」列を探す
          for (let cc = c + 1; cc < headerCells.length; cc++) {
            if (/氏名/.test(headerCells[cc] || '')) {
              pairs.push({ roleCol: c, nameCol: cc });
              c = cc;
              break;
            }
          }
        }
      }
      // データ行: headerRow+1 から「検討した項目」または「検討内容」の手前まで
      const itemsAnchor = findLabel(g, '検討した項目');
      const endRow = itemsAnchor ? itemsAnchor.row - 1 : ns.rowCount;
      for (let r = headerRow + 1; r <= endRow; r++) {
        const row = g[r];
        if (!row) continue;
        for (const p of pairs) {
          const role = (row[p.roleCol] || '').trim();
          const name = (row[p.nameCol] || '').trim();
          if (role || name) t4.attendees.push({ role, name });
        }
      }
    }

    // 検討した項目
    const itemsAnchor = findLabel(g, '検討した項目');
    if (itemsAnchor) t4.discussedItems = valueOf(g, itemsAnchor, 'right');
    // 検討内容
    const discAnchor = findLabel(g, '検討内容');
    if (discAnchor) t4.discussion = valueOf(g, discAnchor, 'right');
    // 結論
    const conclAnchor = findLabel(g, '結論');
    if (conclAnchor) t4.conclusion = valueOf(g, conclAnchor, 'right');
    // 残された課題
    const remainAnchor = findLabel(g, '残された課題');
    if (remainAnchor) t4.remainingTasks = valueOf(g, remainAnchor, 'right');
  } catch (e) {
    warnings.push(`第4表 parse 失敗: ${(e as Error).message}`);
  }
  return t4;
}

// ── 第5表 ──

function parseTable5(ws: ExcelJS.Worksheet, warnings: string[]): ExcelTable5 {
  const out: ExcelT5Record[] = [];
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // ヘッダ行: 「年月日 | 項目 | 内容」が複数組ある
    const ymdAnchors = findAllLabels(g, '年月日');
    if (ymdAnchors.length === 0) {
      warnings.push('第5表 「年月日」ヘッダが見つからない');
      return out;
    }
    // 各ヘッダ列の位置からカテゴリ列(+1) と内容列(+2) を推定
    const blocks: Array<{ dateCol: number; catCol: number; contCol: number; headerRow: number }> = [];
    for (const a of ymdAnchors) {
      blocks.push({
        dateCol: a.col,
        catCol: a.col + 1,
        contCol: a.col + 2,
        headerRow: a.row,
      });
    }
    // データ行は最大の headerRow+1 から末尾まで
    const startRow = Math.max(...blocks.map((b) => b.headerRow)) + 1;
    for (let r = startRow; r <= ns.rowCount; r++) {
      const row = g[r];
      if (!row) continue;
      for (const b of blocks) {
        const d = (row[b.dateCol] || '').trim();
        const cat = (row[b.catCol] || '').trim();
        const cont = (row[b.contCol] || '').trim();
        if (!d && !cat && !cont) continue;
        out.push({
          date: dateValue(d),
          category: cat,
          content: cont,
        });
      }
    }
  } catch (e) {
    warnings.push(`第5表 parse 失敗: ${(e as Error).message}`);
  }
  return out;
}

// ── モニタリング ──

function parseMonitoring(ws: ExcelJS.Worksheet, warnings: string[]): ExcelMonitoring {
  const result: ExcelMonitoring = { history: [], sessions: [] };
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;

    // 「■ モニタリング履歴（全N回）」見出しから N を抽出
    const histHeader = findLabel(g, 'モニタリング履歴');
    if (histHeader) {
      const cell = g[histHeader.row][histHeader.col];
      const m = /全\s*(\d+)\s*回/.exec(cell);
      if (m) result.declaredTotal = parseInt(m[1], 10);
    }

    // 履歴ブロック: ヘッダ行「実施年月日 | 評価結果」の下から、空行 or 次の「■ 第N回モニタリング」直前まで
    const histTableHeader = findLabel(g, '実施年月日');
    if (histTableHeader) {
      const startRow = histTableHeader.row + 1;
      for (let r = startRow; r <= ns.rowCount; r++) {
        const row = g[r];
        if (!row) continue;
        const v1 = (row[histTableHeader.col] || '').trim();
        const v2 = (row[histTableHeader.col + 1] || '').trim();
        if (!v1 && !v2) {
          // 空行で区切れる
          if (result.history.length > 0) break;
          continue;
        }
        // 「■ 第」で始まる行も終了
        if (/^■\s*第/.test(v1) || /^■\s*第/.test(v2)) break;
        result.history.push({
          date: dateValue(v1),
          result: v2,
        });
      }
    }

    // セッション: 「■ 第N回モニタリング」見出しを全部拾う
    const sessHeaders = findAllLabels(g, /^■\s*第\s*\d+\s*回\s*モニタリング/);
    sessHeaders.sort((a, b) => a.row - b.row);
    for (let i = 0; i < sessHeaders.length; i++) {
      const cur = sessHeaders[i];
      const next = sessHeaders[i + 1];
      const endRow = next ? next.row - 1 : ns.rowCount;
      const cell = g[cur.row][cur.col];
      const m = /第\s*(\d+)\s*回/.exec(cell);
      const round = m ? parseInt(m[1], 10) : i + 1;
      const fields: Record<string, string> = {};
      for (let r = cur.row + 1; r <= endRow; r++) {
        const row = g[r];
        if (!row) continue;
        const k = (row[cur.col] || '').trim();
        const v = (row[cur.col + 1] || '').trim();
        if (!k && !v) continue;
        if (/^■/.test(k)) continue;
        if (k) fields[k] = v;
      }
      if (Object.keys(fields).length > 0) {
        result.sessions.push({ round, fields });
      }
    }
  } catch (e) {
    warnings.push(`モニタリング parse 失敗: ${(e as Error).message}`);
  }
  return result;
}

// ── エントリポイント ──

export async function parseCareplanWorkbook(
  buffer: Buffer | ArrayBuffer,
  fileName: string
): Promise<ImportedCareplan> {
  const wb = new ExcelJS.Workbook();
  // exceljs の型は古い Buffer を期待するので as any でしのぐ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load((buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer) as any);
  const warnings: string[] = [];
  const sheetNames = wb.worksheets.map((w) => w.name);

  const ws1 = findSheet(wb, [/第1表/, /第１表/, /居宅サービス計画書\(?１?1?\)?/]);
  const ws2 = findSheet(wb, [/第2表/, /第２表/]);
  const ws3 = findSheet(wb, [/第3表/, /第３表/, /週間サービス計画/]);
  const ws4 = findSheet(wb, [/第4表/, /第４表/, /サービス担当者会議/]);
  const ws5 = findSheet(wb, [/第5表/, /第５表/, /居宅介護支援経過/]);
  const wsM = findSheet(wb, [/モニタリング/]);

  const table1 = ws1 ? parseTable1(ws1, warnings) : (warnings.push('第1表シート未検出'), emptyTable1());
  const table2 = ws2 ? parseTable2(ws2, warnings) : (warnings.push('第2表シート未検出'), [] as ExcelTable2);
  const table3 = ws3 ? parseTable3(ws3, warnings) : (warnings.push('第3表シート未検出'), emptyTable3());
  const table4 = ws4 ? parseTable4(ws4, warnings) : (warnings.push('第4表シート未検出'), emptyTable4());
  const table5 = ws5 ? parseTable5(ws5, warnings) : (warnings.push('第5表シート未検出'), [] as ExcelTable5);
  const monitoring = wsM ? parseMonitoring(wsM, warnings) : { history: [], sessions: [] };

  return {
    fileName,
    schemaVersion: 1,
    table1,
    table2,
    table3,
    table4,
    table5,
    monitoring,
    sheetNames,
    warnings,
  };
}
