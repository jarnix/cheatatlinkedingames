export type CellState = 'empty' | 'cross' | 'queen';

export type QueensBoard = {
  rows: number;
  cols: number;
  /** [row][col] -> color region id (0..rows-1). */
  regions: number[][];
  /** [row][col] -> current cell state (empty/cross/queen). */
  states: CellState[][];
  cellElements: HTMLElement[];
};

export function readBoard(): QueensBoard | null {
  const grid = document.querySelector<HTMLElement>('[data-testid="interactive-grid"]');
  if (!grid) return null;

  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-cell-idx]')).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );
  if (cells.length === 0) return null;

  const styleVar = (grid.getAttribute('style') ?? '').match(/--[\w-]+\s*:\s*(\d+)/);
  const cols = styleVar ? Number(styleVar[1]) : Math.round(Math.sqrt(cells.length));
  if (!cols || cells.length % cols !== 0) return null;
  const rows = cells.length / cols;

  // Map color names (from aria-label) to region ids 0..N-1.
  const colorIds = new Map<string, number>();
  const regions: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  const states: CellState[][] = Array.from({ length: rows }, () =>
    Array<CellState>(cols).fill('empty'),
  );

  for (let i = 0; i < cells.length; i++) {
    const aria = cells[i].getAttribute('aria-label') ?? '';
    const colorMatch = aria.match(/color ([\w ]+?), row/i);
    if (!colorMatch) return null;
    const color = colorMatch[1];
    if (!colorIds.has(color)) colorIds.set(color, colorIds.size);
    const r = Math.floor(i / cols), c = i % cols;
    regions[r][c] = colorIds.get(color)!;
    if (/^Queen/i.test(aria)) states[r][c] = 'queen';
    else if (/^Cross/i.test(aria)) states[r][c] = 'cross';
    else states[r][c] = 'empty';
  }

  return { rows, cols, regions, states, cellElements: cells };
}
