import type { SudokuBoard } from './read-board';

type Point = { x: number; y: number };

export async function play(board: SudokuBoard, solution: number[][]): Promise<void> {
  const digitButtons = new Map<number, HTMLElement>();
  for (const btn of document.querySelectorAll<HTMLElement>('.sudoku-input-button')) {
    const d = Number((btn.textContent ?? '').trim());
    if (Number.isInteger(d) && d >= 1 && d <= board.rows) digitButtons.set(d, btn);
  }
  if (digitButtons.size < board.rows) {
    console.warn('[sudoku-cheat] keypad missing digit buttons', digitButtons.size);
    return;
  }

  const clicks: Array<{ cellPoint: Point; digitPoint: Point }> = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.givens[r][c] != null) continue;
      const idx = r * board.cols + c;
      const cell = board.cellElements[idx];
      const btn = digitButtons.get(solution[r][c]);
      if (!cell || !btn) {
        console.warn('[sudoku-cheat] missing cell or digit button at', r, c);
        return;
      }
      clicks.push({ cellPoint: centerOf(cell), digitPoint: centerOf(btn) });
    }
  }

  const response = (await browser.runtime.sendMessage({
    type: 'sudoku-fill',
    clicks,
    gapMs: 25,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[sudoku-cheat] play failed:', response?.error ?? 'no response');
  }
}

function centerOf(el: HTMLElement): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
