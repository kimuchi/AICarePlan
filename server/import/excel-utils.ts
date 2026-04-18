const ERA_BASE: Record<string, number> = { 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018, M: 1867, T: 1911, S: 1925, H: 1988, R: 2018 };

function norm(s: string): string {
  return (s || '').replace(/[\s\u3000]+/g, '').trim();
}

export function normalizeSheet(ws: { values?: any[][]; merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> }): string[][] {
  const vals = ws.values || [];
  const maxRow = vals.length;
  const maxCol = vals.reduce((m, r) => Math.max(m, (r || []).length), 0);
  const grid = Array.from({ length: maxRow }, (_, r) => Array.from({ length: maxCol }, (_, c) => String(vals[r]?.[c] ?? '').trim()));
  for (const m of ws.merges || []) {
    const top = grid[m.s.r]?.[m.s.c] || '';
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (grid[r]) grid[r][c] = top;
  }
  return grid;
}

export function findLabel(grid: string[][], label: string | RegExp, opts?: { fromRow?: number; toRow?: number }): { row: number; col: number } | null {
  const from = Math.max(0, opts?.fromRow ?? 0);
  const to = Math.min(grid.length - 1, opts?.toRow ?? grid.length - 1);
  for (let r = from; r <= to; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      const v = grid[r][c] || '';
      if (label instanceof RegExp ? label.test(v) : norm(v).includes(norm(label))) return { row: r, col: c };
    }
  }
  return null;
}

export function valueOf(grid: string[][], anchor: { row: number; col: number }, direction: 'right' | 'below' | 'auto' = 'auto'): string {
  const dirs = direction === 'auto' ? ['below', 'right'] as const : [direction];
  for (const d of dirs) {
    if (d === 'below') for (let r = anchor.row + 1; r < grid.length; r++) { const v = grid[r]?.[anchor.col]?.trim() || ''; if (v) return v; }
    if (d === 'right') for (let c = anchor.col + 1; c < (grid[anchor.row]?.length || 0); c++) { const v = grid[anchor.row]?.[c]?.trim() || ''; if (v) return v; }
  }
  return '';
}

export function extractBracketed(s: string): string | null {
  const m = /【\s*([^】]+?)\s*】/.exec(s || '');
  return m ? m[1].trim() : null;
}

export function extractSelected(s: string): string | null {
  return extractBracketed(s) || (/■\s*([^□■\n]+)/.exec(s || '')?.[1]?.trim() || null);
}

function toIso(y: number, m: number, d: number): string { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

export function parseJapaneseDate(s: string): { wareki?: string; iso?: string; age?: number } {
  const out: any = {};
  const src = (s || '').trim();
  const age = /（\s*(\d+)\s*歳\s*）/.exec(src);
  if (age) out.age = parseInt(age[1], 10);
  const w = /(明治|大正|昭和|平成|令和|M|T|S|H|R)\s*(\d+)\D+(\d+)\D+(\d+)/.exec(src);
  if (w) {
    const y = (ERA_BASE[w[1]] || 0) + parseInt(w[2], 10);
    const m = parseInt(w[3], 10), d = parseInt(w[4], 10);
    out.wareki = `${w[1]}${w[2]}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`;
    out.iso = toIso(y, m, d);
    return out;
  }
  const g = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(src);
  if (g) out.iso = toIso(parseInt(g[1], 10), parseInt(g[2], 10), parseInt(g[3], 10));
  return out;
}

export function parseDateRange(s: string): { fromIso?: string; toIso?: string; rawFrom?: string; rawTo?: string } {
  const src = (s || '').replace(/[〜～]/g, '～');
  const [f, t] = src.split('～').map(x => (x || '').trim());
  const from = parseJapaneseDate(f);
  const to = parseJapaneseDate(t);
  return { fromIso: from.iso, toIso: to.iso, rawFrom: f || undefined, rawTo: t || undefined };
}

export function parseEvidence(s: string): { kind?: string; basis?: string; raw: string } {
  const raw = s || '';
  const m = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(raw);
  return m ? { kind: m[1], basis: m[2].trim(), raw } : { raw };
}

export function parseCategoryTag(s: string): { importance: number; categories: string[]; rest: string } {
  const src = s || '';
  const importance = (src.match(/★/g) || []).length;
  const m = /\[([^\]]+)\]/.exec(src);
  const categories = m ? m[1].split('/').map(x => x.trim()).filter(Boolean) : [];
  const rest = src.replace(/★+/g, '').replace(/\[[^\]]*\]/g, '').trim();
  return { importance, categories, rest };
}
