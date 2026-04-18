import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

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
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = path.resolve(here, 'parse_xlsx_stdlib.py');
    const pythonCommands = [process.env.PYTHON_BIN, 'python3', 'python', 'py'].filter((v): v is string => !!v);
    let lastError: unknown = null;

    for (const command of pythonCommands) {
      try {
        const args = command === 'py' ? ['-3', script, tmp] : [script, tmp];
        const { stdout } = await execFileAsync(command, args, { maxBuffer: 20 * 1024 * 1024 });
        return JSON.parse(stdout || '{}');
      } catch (e: any) {
        if (e?.code === 'ENOENT') {
          lastError = e;
          continue;
        }
        throw e;
      }
    }

    const tried = pythonCommands.join(', ') || 'なし';
    console.warn(`[import] Python runtime not found. tried=${tried}. Falling back to empty workbook parse.`);
    if (lastError) console.warn(lastError);
    return { sheets: [] };
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
