import type { PatchesBoard } from './read-board';
import type { RegionAssignment } from './solve';

type Point = { x: number; y: number };
type Drag = Point[];

export async function play(board: PatchesBoard, assignment: RegionAssignment): Promise<void> {
  const drags: Drag[] = [];
  for (let ci = 0; ci < board.clues.length; ci++) {
    const cells = assignment.regions[ci];
    const drag = buildDragForRegion(board, ci, cells);
    if (drag) drags.push(drag);
  }

  console.log(`[patches-cheat] ${board.clues.length} regions, ${drags.length} drags`);

  const response = (await browser.runtime.sendMessage({
    type: 'patches-paint',
    drags,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[patches-cheat] play failed:', response?.error ?? 'no response');
  }
}

/**
 * Each region is a rectangle whose corner is the clue cell (the solver
 * enforces this). Play is a single drag from the clue cell to the opposite
 * corner of the rectangle. The game's drag interpreter creates a rectangle
 * from touchStart to touchEnd and assigns it to the clue's region.
 */
function buildDragForRegion(board: PatchesBoard, ci: number, cells: number[]): Drag | null {
  if (cells.length <= 1) return null;
  const { rows: _rows, cols } = board;
  let minR = board.rows, maxR = -1, minC = board.cols, maxC = -1;
  for (const idx of cells) {
    const r = Math.floor(idx / cols), c = idx % cols;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  const clue = board.clues[ci];
  // Opposite corner: flip both axes from the clue.
  const oppR = clue.row === minR ? maxR : minR;
  const oppC = clue.col === minC ? maxC : minC;
  const oppIdx = oppR * cols + oppC;
  const at = (idx: number): Point => {
    const el = board.cellElements[idx];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return [at(clue.cellIdx), at(oppIdx)];
}
