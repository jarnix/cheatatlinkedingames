import type { PatchesBoard } from './read-board';
import type { Placement } from './solve';

type Point = { x: number; y: number };
type Drag = { points: Point[]; durationMs: number };

export async function play(board: PatchesBoard, placements: Placement[]): Promise<void> {
  const drags: Drag[] = [];
  for (const p of placements) drags.push(...buildDragsForPlacement(board, p));

  console.log(`[patches-cheat] ${placements.length} shapes, ${drags.length} drags total`);

  const response = (await browser.runtime.sendMessage({
    type: 'patches-paint',
    drags,
    gapBetweenDragsMs: 80,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[patches-cheat] play failed:', response?.error ?? 'no response');
  }
}

/**
 * Decompose a rectangle into drags. Each drag is a sequence of cell-center
 * coordinates traversed by a single touch gesture. Strategy:
 *
 * 1. Paint the clue's row first (one drag if the clue is at a row edge, two
 *    if it is interior, dragging from the clue toward each end).
 * 2. For each other row in the rectangle, drag from a painted cell in the
 *    clue's row down (or up) to that row's leftmost cell, then horizontally
 *    across the row. Single L-shaped drag per row.
 *
 * Each drag must start at a painted cell (the clue or already-painted from
 * a prior drag).
 */
function buildDragsForPlacement(board: PatchesBoard, p: Placement): Drag[] {
  const cellAt = (r: number, c: number): Point => {
    const el = board.cellElements[r * board.cols + c];
    const rc = el.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
  };
  const cr = p.clue.row, cc = p.clue.col;
  const r1 = p.row + p.h - 1, c0 = p.col, c1 = p.col + p.w - 1;
  const out: Drag[] = [];

  // Step 1: paint clue's row.
  if (cc === c0) {
    out.push(makeDrag(linePoints(cellAt, cr, cr, c0, c1)));
  } else if (cc === c1) {
    out.push(makeDrag(linePoints(cellAt, cr, cr, c1, c0)));
  } else {
    out.push(makeDrag(linePoints(cellAt, cr, cr, cc, c0)));
    out.push(makeDrag(linePoints(cellAt, cr, cr, cc, c1)));
  }

  // Step 2: each other row, L-shaped drag from (cr, c0) down/up to (r, c0)
  // then across to (r, c1). (cr, c0) was painted by step 1.
  for (let r = p.row; r <= r1; r++) {
    if (r === cr) continue;
    const points: Point[] = [];
    const rowStep = r > cr ? 1 : -1;
    for (let rr = cr; rr !== r + rowStep; rr += rowStep) points.push(cellAt(rr, c0));
    for (let cc2 = c0 + 1; cc2 <= c1; cc2++) points.push(cellAt(r, cc2));
    out.push(makeDrag(points));
  }

  return out;
}

function linePoints(
  cellAt: (r: number, c: number) => Point,
  r0: number,
  r1: number,
  c0: number,
  c1: number,
): Point[] {
  const points: Point[] = [];
  if (r0 === r1) {
    const step = c0 <= c1 ? 1 : -1;
    for (let c = c0; c !== c1 + step; c += step) points.push(cellAt(r0, c));
  } else {
    const step = r0 <= r1 ? 1 : -1;
    for (let r = r0; r !== r1 + step; r += step) points.push(cellAt(r, c0));
  }
  return points;
}

function makeDrag(points: Point[]): Drag {
  return { points, durationMs: Math.max(points.length * 35, 120) };
}
