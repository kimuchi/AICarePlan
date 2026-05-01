/**
 * Excel取り込み用の汎用ユーティリティ。
 *
 * 重要な設計原則:
 * - セル番地は絶対に固定しない。ラベル文字列アンカーで動的に特定する。
 * - セル結合は左上セルに値を投影して扱う (`normalizeSheet`)。
 *   「この行は結合の継続行か」を知りたいときは `mergeMaster` を併用する。
 * - 空白ゆらぎ（全角/半角スペース・改行）は findLabel 側で吸収する。
 */

import ExcelJS from 'exceljs';

export interface NormalizedSheet {
  /** 結合セルを全セルに投影した値グリッド。1-origin: grid[row][col] */
  grid: string[][];
  /** (row,col) が含まれる結合範囲の左上セル。結合していないセルは自分自身を指す。 */
  mergeMaster: Array<Array<{ row: number; col: number }>>;
  /** ExcelJS の行数・列数の最大値（1-origin で row<=rowCount, col<=colCount を保証） */
  rowCount: number;
  colCount: number;
}

/** ExcelJS のセル値を string に畳む */
export function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (Array.isArray((obj as { richText?: unknown[] }).richText)) {
      return (obj as { richText: Array<{ text: string }> }).richText
        .map((r) => r.text || '')
        .join('');
    }
    if ('result' in obj && obj.result != null) return cellToString(obj.result);
    if ('text' in obj && obj.text != null) return cellToString(obj.text);
    if ('hyperlink' in obj && typeof obj.hyperlink === 'string') {
      return (obj.text as string) || obj.hyperlink;
    }
  }
  return String(v);
}

/**
 * シート全体を「行×列の値マトリクス」に正規化する。
 * 結合セルは左上セルの値を全セルに投影する。
 * mergeMaster[r][c] は (r,c) が属する結合範囲の左上セル (未結合セルは自分自身)。
 */
export function normalizeSheet(ws: ExcelJS.Worksheet): NormalizedSheet {
  const rowCount = Math.max(ws.rowCount || 0, 0);
  const colCount = Math.max(ws.columnCount || 0, 0);
  const grid: string[][] = [];
  const mergeMaster: Array<Array<{ row: number; col: number }>> = [];
  for (let r = 0; r <= rowCount; r++) {
    const gridRow: string[] = [];
    const mmRow: Array<{ row: number; col: number }> = [];
    for (let c = 0; c <= colCount; c++) {
      gridRow.push('');
      mmRow.push({ row: r, col: c });
    }
    grid.push(gridRow);
    mergeMaster.push(mmRow);
  }
  // まず素の値を読む
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      grid[r][c] = cellToString(cell.value);
    }
  }
  // 結合情報から投影 + mergeMaster を埋める
  const merges = parseMerges(ws);
  for (const m of merges) {
    const masterVal = grid[m.top]?.[m.left] ?? '';
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (!grid[r] || grid[r][c] === undefined) continue;
        if (grid[r][c] === '' || (r !== m.top || c !== m.left)) {
          grid[r][c] = masterVal;
        }
        mergeMaster[r][c] = { row: m.top, col: m.left };
      }
    }
  }
  return { grid, mergeMaster, rowCount, colCount };
}

interface MergeRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** ExcelJS の model.merges や _merges から MergeRange[] を得る */
function parseMerges(ws: ExcelJS.Worksheet): MergeRange[] {
  const out: MergeRange[] = [];
  // ExcelJS は model.merges: ["A1:B2", ...] を提供する
  const arr: string[] | undefined = (ws.model as { merges?: string[] }).merges;
  if (Array.isArray(arr)) {
    for (const r of arr) {
      const m = parseA1Range(r);
      if (m) out.push(m);
    }
  }
  // 予備: _merges
  const maybeMerges = (ws as unknown as { _merges?: Record<string, { model?: { range?: string } }> })._merges;
  if (maybeMerges && typeof maybeMerges === 'object') {
    for (const k of Object.keys(maybeMerges)) {
      const v = maybeMerges[k];
      const ref = v?.model?.range || k;
      const m = parseA1Range(ref);
      if (m) {
        const dup = out.some((x) => x.top === m.top && x.left === m.left && x.bottom === m.bottom && x.right === m.right);
        if (!dup) out.push(m);
      }
    }
  }
  return out;
}

function colLetterToNumber(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}

function parseA1Range(s: string): MergeRange | null {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(s.trim());
  if (!m) return null;
  const l1 = m[1].toUpperCase();
  const r1 = parseInt(m[2], 10);
  const l2 = (m[3] || m[1]).toUpperCase();
  const r2 = parseInt(m[4] || m[2], 10);
  return {
    top: Math.min(r1, r2),
    bottom: Math.max(r1, r2),
    left: Math.min(colLetterToNumber(l1), colLetterToNumber(l2)),
    right: Math.max(colLetterToNumber(l1), colLetterToNumber(l2)),
  };
}

// ── 文字列正規化・比較 ──

/** 空白ゆらぎを吸収した比較用キー */
export function normLabel(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/\s+/g, '')
    .replace(/　/g, '')
    .replace(/[（\(]/g, '(')
    .replace(/[）\)]/g, ')')
    .replace(/[：:]/g, ':')
    .trim();
}

// ── ラベル検索 ──

export interface LabelFindOptions {
  fromRow?: number;
  toRow?: number;
  fromCol?: number;
  toCol?: number;
  /** デフォルト true: 部分一致。false で完全一致 */
  partial?: boolean;
}

/**
 * ラベルを含むセルの位置を返す（見つからなければ null）。
 * 部分一致で、かつ空白ゆらぎを吸収する。
 */
export function findLabel(
  grid: string[][],
  label: string | RegExp,
  opts: LabelFindOptions = {}
): { row: number; col: number } | null {
  const fromRow = opts.fromRow ?? 1;
  const toRow = opts.toRow ?? grid.length - 1;
  const fromCol = opts.fromCol ?? 1;
  const toCol = opts.toCol ?? (grid[0]?.length || 1) - 1;
  const partial = opts.partial ?? true;
  let needleKey = '';
  if (typeof label === 'string') needleKey = normLabel(label);
  for (let r = fromRow; r <= toRow; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = fromCol; c <= Math.min(toCol, row.length - 1); c++) {
      const v = row[c];
      if (!v) continue;
      if (typeof label === 'string') {
        const key = normLabel(v);
        if (partial) {
          if (key.includes(needleKey)) return { row: r, col: c };
        } else {
          if (key === needleKey) return { row: r, col: c };
        }
      } else {
        if (label.test(v)) return { row: r, col: c };
      }
    }
  }
  return null;
}

export function findAllLabels(
  grid: string[][],
  label: string | RegExp,
  opts: LabelFindOptions = {}
): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = [];
  const fromRow = opts.fromRow ?? 1;
  const toRow = opts.toRow ?? grid.length - 1;
  const fromCol = opts.fromCol ?? 1;
  const toCol = opts.toCol ?? (grid[0]?.length || 1) - 1;
  const partial = opts.partial ?? true;
  let needleKey = '';
  if (typeof label === 'string') needleKey = normLabel(label);
  for (let r = fromRow; r <= toRow; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = fromCol; c <= Math.min(toCol, row.length - 1); c++) {
      const v = row[c];
      if (!v) continue;
      if (typeof label === 'string') {
        const key = normLabel(v);
        if (partial ? key.includes(needleKey) : key === needleKey) {
          out.push({ row: r, col: c });
        }
      } else {
        if (label.test(v)) out.push({ row: r, col: c });
      }
    }
  }
  return out;
}

/**
 * anchor セルに対する「値」とみなすセル値を返す。
 * direction:
 *   right  — 右方向に走査して最初の非空セル（ラベルと同一の文字列は飛ばす）
 *   below  — 下方向
 *   auto   — まず右、次に下
 */
export function valueOf(
  grid: string[][],
  anchor: { row: number; col: number },
  direction: 'right' | 'below' | 'auto' = 'auto'
): string {
  const rowCount = grid.length - 1;
  const colCount = (grid[0]?.length || 1) - 1;
  const label = grid[anchor.row]?.[anchor.col] || '';
  const labelKey = normLabel(label);

  const scan = (dr: number, dc: number): string => {
    let r = anchor.row + dr;
    let c = anchor.col + dc;
    while (r >= 1 && r <= rowCount && c >= 1 && c <= colCount) {
      const v = grid[r]?.[c];
      if (v && normLabel(v) !== labelKey) return v;
      r += dr;
      c += dc;
    }
    return '';
  };

  if (direction === 'right') return scan(0, 1);
  if (direction === 'below') return scan(1, 0);
  const right = scan(0, 1);
  if (right) return right;
  return scan(1, 0);
}

// ── 選択値抽出 ──

/**
 * "【 要介護１ 】 ・ 要介護２ ..." → "要介護１"
 */
export function extractBracketed(s: string): string | null {
  if (!s) return null;
  const m = /【\s*([^】]+?)\s*】/.exec(s);
  if (m) return m[1].trim();
  return null;
}

/**
 * "【 初回 】 ・ 紹介 ・ 継続" → "初回"
 * "□自立 □J1 □J2 ■A1 □A2" → "A1"
 * "■可 □つかまれば可 □不可" → "可"
 * いずれも見つからなければ null。
 */
export function extractSelected(s: string): string | null {
  if (!s) return null;
  const br = extractBracketed(s);
  if (br) return br;
  // ■ の直後のトークン（空白/改行まで）を拾う。複数あれば先頭。
  const m = /■\s*([^■□\s\n\r\t\/、，,]+)/.exec(s);
  if (m) return m[1].trim();
  return null;
}

/**
 * "□自立 ■見守り ■一部介助" → ["見守り", "一部介助"]
 * "■A1" → ["A1"]
 */
export function extractSelectedAll(s: string): string[] {
  if (!s) return [];
  const br = extractBracketed(s);
  if (br) return [br];
  const out: string[] = [];
  const re = /■\s*([^■□\s\n\r\t\/、，,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * チェックボックス群を SelectionGroup に解析する。
 * "□A □B ■C □D" → options:[A,B,C,D], selected:"C", selectedAll:["C"]
 * 【 】形式もここで吸収する。
 */
export function parseSelectionGroup(s: string): {
  raw: string;
  selected?: string;
  selectedAll: string[];
  options: string[];
} {
  const raw = s || '';
  const selectedAll = extractSelectedAll(raw);
  // options = 【X】/■X/□X すべての列挙
  const options: string[] = [];
  const seen = new Set<string>();
  const re = /[【\[]?[\s]*([■□]?)\s*([^■□【】\[\]\s・／\/,、，]+)/g;
  // この正規表現は壊れやすいので、簡単に: ■/□/【】のマーカーごとに拾う
  const tokenRe = /(?:【\s*([^】]+?)\s*】|■\s*([^■□\s\n\r\t\/、，,]+)|□\s*([^■□\s\n\r\t\/、，,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(raw)) !== null) {
    const tok = (m[1] || m[2] || m[3] || '').trim();
    if (tok && !seen.has(tok)) {
      seen.add(tok);
      options.push(tok);
    }
  }
  // 副作用回避の unused ref
  void re;
  return {
    raw,
    selected: selectedAll[0],
    selectedAll,
    options,
  };
}

// ── 日付解析 ──

const WAREKI_ERAS: Array<{ name: string; start: number }> = [
  { name: '令和', start: 2018 }, // R1=2019, R1年=2019年なのでoffset+2018
  { name: '平成', start: 1988 }, // H1=1989
  { name: '昭和', start: 1925 }, // S1=1926
  { name: '大正', start: 1911 },
  { name: '明治', start: 1867 },
];
const WAREKI_ABBR: Record<string, string> = { R: '令和', H: '平成', S: '昭和', T: '大正', M: '明治' };

export interface ParsedJaDate {
  wareki?: string;
  iso?: string;
  age?: number;
}

/** "昭和27年06月21日  （73歳）" / "令和07年01月01日" / "2025-01-01" 等を解釈 */
export function parseJapaneseDate(s: string): ParsedJaDate {
  const out: ParsedJaDate = {};
  if (!s) return out;
  const str = String(s);
  // 年齢
  const ageM = /（\s*(\d+)\s*歳\s*）|\(\s*(\d+)\s*歳\s*\)/.exec(str);
  if (ageM) out.age = parseInt(ageM[1] || ageM[2], 10);
  // 和暦: 令和/平成/昭和/大正/明治 + R/H/S/T/M
  const fullRe = /(令和|平成|昭和|大正|明治)\s*(\d+|元)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/;
  const abbrRe = /([RHSTM])\s*(\d+|元)[\s\/.\-年]+(\d+)[\s\/.\-月]+(\d+)/i;
  let era = '';
  let y = 0;
  let mo = 0;
  let d = 0;
  const full = fullRe.exec(str);
  if (full) {
    era = full[1];
    y = full[2] === '元' ? 1 : parseInt(full[2], 10);
    mo = parseInt(full[3], 10);
    d = parseInt(full[4], 10);
  } else {
    const ab = abbrRe.exec(str);
    if (ab) {
      era = WAREKI_ABBR[ab[1].toUpperCase()] || '';
      y = ab[2] === '元' ? 1 : parseInt(ab[2], 10);
      mo = parseInt(ab[3], 10);
      d = parseInt(ab[4], 10);
    }
  }
  if (era && y && mo && d) {
    const eraDef = WAREKI_ERAS.find((e) => e.name === era);
    if (eraDef) {
      // R/H/S 略号で y が era の合理的範囲を逸脱する場合は西暦下2桁とみなす
      // (例: 令和25 はあり得ない → "R25" は 2025 と解釈)
      // 略号(R/H/S/T/M)で y がこの値を超える場合は「西暦下2桁」とみなす
      const eraReasonableMax: Record<string, number> = { 令和: 15, 平成: 31, 昭和: 64, 大正: 15, 明治: 45 };
      const max = eraReasonableMax[era] ?? 99;
      let yyyy: number;
      if (/^[RHSTM]/i.test(str.trim()) && y > max) {
        // 西暦下2桁: 20YY に正規化（00-49 は 2000+, 50-99 は 1900+）
        yyyy = y >= 50 ? 1900 + y : 2000 + y;
      } else {
        yyyy = eraDef.start + y;
      }
      out.iso = `${yyyy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    out.wareki = `${era}${String(y).padStart(2, '0')}年${String(mo).padStart(2, '0')}月${String(d).padStart(2, '0')}日`;
    return out;
  }
  // 西暦 YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  const iso = /(\d{4})[\-\/.年](\d{1,2})[\-\/.月](\d{1,2})/.exec(str);
  if (iso) {
    out.iso = `${iso[1]}-${String(parseInt(iso[2], 10)).padStart(2, '0')}-${String(parseInt(iso[3], 10)).padStart(2, '0')}`;
    return out;
  }
  return out;
}

/**
 * "R25/01/01～R27/12/31" や "令和07年01月01日  ～  令和09年12月31日" を分解
 */
export function parseDateRange(s: string): {
  raw: string;
  fromIso?: string;
  toIso?: string;
  rawFrom?: string;
  rawTo?: string;
} {
  const raw = s || '';
  if (!raw) return { raw };
  // 区切り記号: ～ ~ 〜 -
  const parts = raw.split(/\s*[〜～~]\s*/);
  if (parts.length >= 2) {
    const rawFrom = parts[0].trim();
    const rawTo = parts.slice(1).join('〜').trim();
    const from = parseJapaneseDate(rawFrom);
    const to = parseJapaneseDate(rawTo);
    return { raw, rawFrom, rawTo, fromIso: from.iso, toIso: to.iso };
  }
  const single = parseJapaneseDate(raw);
  return { raw, fromIso: single.iso };
}

/**
 * "[要介護度フォールバック(要介護１)] 根拠:要介護度要介護１からの推定" を構造化
 */
export function parseEvidence(s: string): { kind?: string; basis?: string; raw: string } {
  const raw = s || '';
  if (!raw) return { raw };
  const kindM = /\[([^\]]+)\]/.exec(raw);
  const kind = kindM ? kindM[1].trim() : undefined;
  const basisM = /根拠\s*[:：]\s*(.*)$/s.exec(raw);
  const basis = basisM ? basisM[1].trim() : undefined;
  return { kind, basis, raw };
}

/** "★★★[食事/服薬/受診/訪問]" 等から重要度・カテゴリ・残文字列を取り出す */
export function parseCategoryTag(s: string): {
  importance: number;
  categories: string[];
  rest: string;
  raw: string;
} {
  const raw = s || '';
  if (!raw) return { importance: 0, categories: [], rest: '', raw };
  let rest = raw;
  // ★の個数
  const starM = /^(\s*★+)/.exec(rest);
  const importance = starM ? (starM[1].match(/★/g) || []).length : 0;
  if (starM) rest = rest.slice(starM[1].length);
  // [.../.../...]
  const bracketM = /\[([^\]]*)\]/.exec(rest);
  let categories: string[] = [];
  if (bracketM) {
    categories = bracketM[1]
      .split(/[\/、,，]/)
      .map((t) => t.trim())
      .filter((t) => !!t);
    rest = rest.replace(bracketM[0], '').trim();
  }
  return { importance, categories, rest: rest.trim(), raw };
}
