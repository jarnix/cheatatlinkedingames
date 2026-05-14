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
 * Drag from the rectangle's top-left corner to its bottom-right corner. The
 * game treats every touch gesture as a bbox(touchStart, touchEnd) and assigns
 * that rectangle to whichever clue sits inside it. The clue doesn't have to
 * be at a corner — it can be anywhere within the rectangle.
 */
function buildDragForRegion(board: PatchesBoard, _ci: number, cells: number[]): Drag | null {
  if (cells.length <= 1) return null;
  const { rows, cols } = board;
  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  for (const idx of cells) {
    const r = Math.floor(idx / cols), c = idx % cols;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  const tlIdx = minR * cols + minC;
  const brIdx = maxR * cols + maxC;
  const at = (idx: number): Point => {
    const el = board.cellElements[idx];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return [at(tlIdx), at(brIdx)];
}
