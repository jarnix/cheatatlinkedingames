import type { SudokuBoard } from './read-board';

export function solve(board: SudokuBoard): number[][] | null {
  const { rows, cols, boxRows, boxCols, givens } = board;
  const N = rows;
  const grid: (number | null)[][] = givens.map((r) => r.slice());

  const isValid = (r: number, c: number, v: number): boolean => {
    for (let i = 0; i < N; i++) {
      if (grid[r][i] === v) return false;
      if (grid[i][c] === v) return false;
    }
    const br = Math.floor(r / boxRows) * boxRows;
    const bc = Math.floor(c / boxCols) * boxCols;
    for (let i = 0; i < boxRows; i++) {
      for (let j = 0; j < boxCols; j++) {
        if (grid[br + i][bc + j] === v) return false;
      }
    }
    return true;
  };

  const backtrack = (): boolean => {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] != null) continue;
        for (let v = 1; v <= N; v++) {
          if (isValid(r, c, v)) {
            grid[r][c] = v;
            if (backtrack()) return true;
            grid[r][c] = null;
          }
        }
        return false;
      }
    }
    return true;
  };

  return backtrack() ? (grid as number[][]) : null;
}
