import type { Cell, EdgeKind, TangoBoard } from './read-board';

/**
 * Backtracking solver. Constraints:
 *  - Each cell is 0 (sun) or 1 (moon).
 *  - No three-in-a-row of the same kind, horizontally or vertically.
 *  - Each row and column contains exactly rows/2 zeros and rows/2 ones.
 *  - 'equal' edge between two adjacent cells: cells must be equal.
 *  - 'cross' edge: cells must differ.
 */
export function solve(board: TangoBoard): (0 | 1)[][] | null {
  const { rows, cols, givens, edges } = board;
  if (rows !== cols || rows % 2 !== 0) return null;
  const half = rows / 2;
  const grid: Cell[][] = givens.map((r) => r.slice());

  const validAt = (r: number, c: number, v: 0 | 1): boolean => {
    grid[r][c] = v;
    const ok = checkLocal(r, c, v) && checkRowCol(r, c, half) && checkEdges(r, c, edges);
    grid[r][c] = givens[r][c];
    return ok;
  };

  function checkLocal(r: number, c: number, v: 0 | 1): boolean {
    // No three of v in a row in this row or column, considering placement.
    if (c >= 2 && grid[r][c - 1] === v && grid[r][c - 2] === v) return false;
    if (c >= 1 && c + 1 < cols && grid[r][c - 1] === v && grid[r][c + 1] === v) return false;
    if (c + 2 < cols && grid[r][c + 1] === v && grid[r][c + 2] === v) return false;
    if (r >= 2 && grid[r - 1][c] === v && grid[r - 2][c] === v) return false;
    if (r >= 1 && r + 1 < rows && grid[r - 1][c] === v && grid[r + 1][c] === v) return false;
    if (r + 2 < rows && grid[r + 1][c] === v && grid[r + 2][c] === v) return false;
    return true;
  }

  function checkRowCol(r: number, c: number, half: number): boolean {
    let zr = 0, or = 0, zc = 0, oc = 0;
    for (let i = 0; i < cols; i++) {
      if (grid[r][i] === 0) zr++; else if (grid[r][i] === 1) or++;
    }
    for (let i = 0; i < rows; i++) {
      if (grid[i][c] === 0) zc++; else if (grid[i][c] === 1) oc++;
    }
    return zr <= half && or <= half && zc <= half && oc <= half;
  }

  function checkEdges(r: number, c: number, edges: Map<string, EdgeKind>): boolean {
    const v = grid[r][c];
    const checks: Array<[number, number, string]> = [
      [r, c - 1, `h:${r}:${c - 1}`],
      [r, c + 1, `h:${r}:${c}`],
      [r - 1, c, `v:${r - 1}:${c}`],
      [r + 1, c, `v:${r}:${c}`],
    ];
    for (const [nr, nc, key] of checks) {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const kind = edges.get(key);
      if (!kind) continue;
      const nv = grid[nr][nc];
      if (nv == null || v == null) continue;
      if (kind === 'equal' && nv !== v) return false;
      if (kind === 'cross' && nv === v) return false;
    }
    return true;
  }

  function backtrack(): boolean {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] != null) continue;
        for (const v of [0, 1] as const) {
          if (validAt(r, c, v)) {
            grid[r][c] = v;
            if (backtrack()) return true;
            grid[r][c] = null;
          }
        }
        return false;
      }
    }
    return true;
  }

  return backtrack() ? (grid as (0 | 1)[][]) : null;
}
