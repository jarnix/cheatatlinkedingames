import type { CellState, QueensBoard } from './read-board';

type Point = { x: number; y: number };

/**
 * The click cycle is empty -> cross -> queen -> empty. For each cell we
 * dispatch the number of clicks needed to go from its current state to the
 * target state (queen on the placement, empty otherwise).
 */
const CLICKS_TO_REACH: Record<CellState, Record<CellState, number>> = {
  empty: { empty: 0, cross: 1, queen: 2 },
  cross: { empty: 2, cross: 0, queen: 1 },
  queen: { empty: 1, cross: 2, queen: 0 },
};

export async function play(board: QueensBoard, placement: number[]): Promise<void> {
  const clicks: Point[] = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const cur = board.states[r][c];
      const want: CellState = placement[r] === c ? 'queen' : 'empty';
      const n = CLICKS_TO_REACH[cur][want];
      if (n === 0) continue;
      const el = board.cellElements[r * board.cols + c];
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      for (let i = 0; i < n; i++) clicks.push({ x, y });
    }
  }

  console.log(`[queens-cheat] ${clicks.length} clicks`);

  const response = (await browser.runtime.sendMessage({
    type: 'queens-place',
    clicks,
    gapMs: 25,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[queens-cheat] play failed:', response?.error ?? 'no response');
  }
}
