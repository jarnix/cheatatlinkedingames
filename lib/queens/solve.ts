import type { QueensBoard } from './read-board';

/**
 * Place one queen in every row, every column, and every color region, such
 * that no two queens are orthogonally or diagonally adjacent. Returns the
 * column index of the queen in each row, or null if unsolvable.
 */
export function solve(board: QueensBoard): number[] | null {
  const { rows, cols, regions } = board;
  if (rows !== cols) return null; // canonical Queens grids are square
  const placement = new Array<number>(rows).fill(-1);
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();

  function backtrack(r: number): boolean {
    if (r === rows) return true;
    for (let c = 0; c < cols; c++) {
      if (usedCols.has(c)) continue;
      const region = regions[r][c];
      if (usedRegions.has(region)) continue;
      // Adjacency check against the queen in the previous row only (placing
      // row-by-row, lower rows haven't been placed yet).
      if (r > 0 && Math.abs(c - placement[r - 1]) <= 1) continue;
      placement[r] = c;
      usedCols.add(c);
      usedRegions.add(region);
      if (backtrack(r + 1)) return true;
      placement[r] = -1;
      usedCols.delete(c);
      usedRegions.delete(region);
    }
    return false;
  }

  return backtrack(0) ? placement : null;
}
