import type { PatchesBoard } from './read-board';
import type { Placement } from './solve';

type Point = { x: number; y: number };
type Drag = Point[];

export async function play(board: PatchesBoard, placements: Placement[]): Promise<void> {
  const drags: Drag[] = [];
  for (const p of placements) drags.push(...buildDragsForPlacement(board, p));

  console.log(`[patches-cheat] ${placements.length} shapes, ${drags.length} drags`);

  const response = (await browser.runtime.sendMessage({
    type: 'patches-paint',
    drags,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[patches-cheat] play failed:', response?.error ?? 'no response');
  }
}

/**
 * One Hamiltonian-path drag per shape, starting at the clue. The drag visits
 * every cell of the rectangle exactly once.
 *
 * - 1×N rectangle, clue at endpoint: single straight drag.
 * - 1×N rectangle, clue interior: two drags from the clue, one each direction.
 * - 2D rectangle: row-by-row snake from the clue corner. (Every Patches clue
 *   observed so far sits at a corner of its rectangle.)
 *
 * The game's gesture model: only the FIRST cell of the drag must be painted
 * (the clue). Subsequent cells touched by the drag get added to the region as
 * the drag passes over them, in order. So the path must START at the clue.
 */
function buildDragsForPlacement(board: PatchesBoard, p: Placement): Drag[] {
  const cellAt = (r: number, c: number): Point => {
    const el = board.cellElements[r * board.cols + c];
    const rc = el.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
  };
  const cr = p.clue.row, cc = p.clue.col;
  const r0 = p.row, c0 = p.col;
  const r1 = p.row + p.h - 1, c1 = p.col + p.w - 1;
  const out: Drag[] = [];

  if (p.w === 1 || p.h === 1) {
    if (p.w === 1) {
      if (cr === r0) out.push(rangeAt((r) => cellAt(r, c0), r0, r1));
      else if (cr === r1) out.push(rangeAt((r) => cellAt(r, c0), r1, r0));
      else {
        out.push(rangeAt((r) => cellAt(r, c0), cr, r0));
        out.push(rangeAt((r) => cellAt(r, c0), cr, r1));
      }
    } else {
      if (cc === c0) out.push(rangeAt((c) => cellAt(r0, c), c0, c1));
      else if (cc === c1) out.push(rangeAt((c) => cellAt(r0, c), c1, c0));
      else {
        out.push(rangeAt((c) => cellAt(r0, c), cc, c0));
        out.push(rangeAt((c) => cellAt(r0, c), cc, c1));
      }
    }
    return out;
  }

  // 2D snake from the clue corner.
  const path: Array<[number, number]> = [];
  if (cr === r0 && cc === c0)      snake(path, r0, r1, c0, c1, 1, 1);
  else if (cr === r0 && cc === c1) snake(path, r0, r1, c1, c0, 1, -1);
  else if (cr === r1 && cc === c0) snake(path, r1, r0, c0, c1, -1, 1);
  else if (cr === r1 && cc === c1) snake(path, r1, r0, c1, c0, -1, -1);
  else {
    console.warn(`[patches-cheat] 2D clue not at corner: ${p.w}x${p.h} at (${r0},${c0}), clue (${cr},${cc})`);
    return out;
  }
  out.push(path.map(([r, c]) => cellAt(r, c)));
  return out;
}

function rangeAt(at: (i: number) => Point, a: number, b: number): Point[] {
  const out: Point[] = [];
  const step = a <= b ? 1 : -1;
  for (let i = a; i !== b + step; i += step) out.push(at(i));
  return out;
}

function snake(
  out: Array<[number, number]>,
  rStart: number,
  rEnd: number,
  cStart: number,
  cEnd: number,
  rStep: number,
  cStep: number,
): void {
  let curC = cStart, curCEnd = cEnd, curCStep = cStep;
  for (let r = rStart; r !== rEnd + rStep; r += rStep) {
    for (let c = curC; c !== curCEnd + curCStep; c += curCStep) {
      out.push([r, c]);
    }
    [curC, curCEnd] = [curCEnd, curC];
    curCStep = -curCStep;
  }
}
