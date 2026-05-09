export type SudokuBoard = {
  rows: number;
  cols: number;
  /** Box height (rows per box). Mini sudoku: 2. */
  boxRows: number;
  /** Box width (cols per box). Mini sudoku: 3. */
  boxCols: number;
  /** [row][col] -> digit 1..N if given, else null. */
  givens: (number | null)[][];
  /** Cells in row-major order (data-cell-idx 0..N*N-1). */
  cellElements: HTMLElement[];
};

export function readBoard(): SudokuBoard | null {
  const grid = document.querySelector<HTMLElement>('.sudoku-grid');
  if (!grid) return null;

  const cells = Array.from(grid.querySelectorAll<HTMLElement>('.sudoku-cell')).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );

  // Mini sudoku is 6×6 with 2×3 boxes. We hard-code that here; if LinkedIn
  // adds a different size we'll need to read --rows/--cols from inline style.
  const rows = 6, cols = 6, boxRows = 2, boxCols = 3;
  if (cells.length !== rows * cols) return null;

  const givens: (number | null)[][] = Array.from({ length: rows }, () =>
    Array<number | null>(cols).fill(null),
  );
  for (let i = 0; i < cells.length; i++) {
    const text = cells[i].querySelector('.sudoku-cell-content')?.textContent?.trim() ?? '';
    if (/^[1-6]$/.test(text)) {
      givens[Math.floor(i / cols)][i % cols] = Number(text);
    }
  }

  return { rows, cols, boxRows, boxCols, givens, cellElements: cells };
}
