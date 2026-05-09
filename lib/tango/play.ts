import type { TangoBoard } from './read-board';

type Click = { x: number; y: number; button: 'left' | 'right' };

export async function play(board: TangoBoard, solution: (0 | 1)[][]): Promise<void> {
  // Left click sets sun (cell-zero) when the cell is empty.
  // Right click sets moon (cell-one) when the cell is empty.
  // For prefilled cells, do nothing.
  const clicks: Click[] = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.givens[r][c] != null) continue;
      const idx = r * board.cols + c;
      const el = board.cellElements[idx];
      const rc = el.getBoundingClientRect();
      const x = rc.left + rc.width / 2;
      const y = rc.top + rc.height / 2;
      clicks.push({ x, y, button: solution[r][c] === 0 ? 'left' : 'right' });
    }
  }

  console.log(`[tango-cheat] ${clicks.length} clicks`);

  const response = (await browser.runtime.sendMessage({
    type: 'tango-fill',
    clicks,
    gapMs: 25,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[tango-cheat] play failed:', response?.error ?? 'no response');
  }
}
