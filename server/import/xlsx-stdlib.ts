import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface RawSheetCell { r: number; c: number; v: string }
export interface RawSheetMerge { r1: number; c1: number; r2: number; c2: number }
export interface RawSheet {
  name: string;
  maxRow: number;
  maxCol: number;
  cells: RawSheetCell[];
  merges: RawSheetMerge[];
}

export async function parseXlsxWithStdlib(buffer: Buffer): Promise<{ sheets: RawSheet[] }> {
  const tmp = path.join(os.tmpdir(), `import-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await writeFile(tmp, buffer, { mode: 0o600 });
  try {
    const script = path.resolve(process.cwd(), 'server/import/parse_xlsx_stdlib.py');
    const candidates = [process.env.IMPORT_PYTHON_BIN, 'python3', 'python'].filter((v): v is string => !!v && v.trim().length > 0);
    let lastErr: any;
    for (const bin of candidates) {
      try {
        const { stdout } = await execFileAsync(bin, [script, tmp], { maxBuffer: 20 * 1024 * 1024 });
        return JSON.parse(stdout || '{}');
      } catch (e: any) {
        lastErr = e;
        if (e?.code === 'ENOENT') continue;
        throw e;
      }
    }
    const tried = candidates.join(', ');
    throw new Error(`Python実行環境が見つかりません（試行: ${tried}）。python3 をインストールするか IMPORT_PYTHON_BIN を設定してください。`);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export function buildGrid(sheet: RawSheet): string[][] {
  const rows = Math.max(sheet.maxRow, 1);
  const cols = Math.max(sheet.maxCol, 1);
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  for (const cell of sheet.cells) {
    if (cell.r > 0 && cell.c > 0 && cell.r <= rows && cell.c <= cols) {
      grid[cell.r - 1][cell.c - 1] = String(cell.v ?? '').trim();
    }
  }
  for (const m of sheet.merges || []) {
    const top = grid[m.r1 - 1]?.[m.c1 - 1] || '';
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        if (grid[r - 1]) grid[r - 1][c - 1] = top;
      }
    }
  }
  return grid;
}
