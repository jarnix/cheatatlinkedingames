import type { Clue, PatchesBoard, ShapeKind } from './read-board';

export type Placement = {
  clue: Clue;
  /** Top-left corner. */
  row: number;
  col: number;
  /** Width and height of the rectangle. */
  w: number;
  h: number;
};

/**
 * Tile every cell of the board with rectangles that satisfy each clue:
 * - 'square' kind: w === h
 * - 'wide' kind:  w >= 2 && h === 1
 * - 'tall' kind:  h >= 2 && w === 1
 * - if clue.size is set, w*h === clue.size
 * The rectangle must contain the clue cell. Each clue gets exactly one
 * rectangle, every cell ends up in exactly one rectangle.
 */
export function solve(board: PatchesBoard): Placement[] | null {
  const { rows, cols, clues } = board;
  const total = rows * cols;

  // Each clue's candidate placements, sorted by descending size so the most
  // constraining choices fail-fast.
  const candidates = clues.map((c) => enumeratePlacements(c, rows, cols));
  if (candidates.some((cs) => cs.length === 0)) return null;

  // Sum-of-sizes pruning: total area must equal rows*cols. If sum of min
  // candidate sizes exceeds total, or sum of max sizes is below total, no go.
  const minTotal = candidates.reduce((s, cs) => s + Math.min(...cs.map(area)), 0);
  const maxTotal = candidates.reduce((s, cs) => s + Math.max(...cs.map(area)), 0);
  if (minTotal > total || maxTotal < total) return null;

  const occupied = new Int32Array(total).fill(-1); // -1 = free, else clue index
  const chosen: (Placement | null)[] = clues.map(() => null);

  // Order clues most-constrained-first (fewest candidates) so we backtrack
  // out of dead branches earlier.
  const order = clues.map((_, i) => i).sort((a, b) => candidates[a].length - candidates[b].length);

  function tryClue(orderIdx: number, areaSoFar: number): boolean {
    if (orderIdx === clues.length) {
      return areaSoFar === total && allCovered(occupied);
    }
    const clueIdx = order[orderIdx];
    for (const p of candidates[clueIdx]) {
      if (!fits(p, occupied, cols)) continue;
      mark(p, occupied, cols, clueIdx);
      chosen[clueIdx] = p;
      if (tryClue(orderIdx + 1, areaSoFar + area(p))) return true;
      mark(p, occupied, cols, -1);
      chosen[clueIdx] = null;
    }
    return false;
  }

  return tryClue(0, 0) ? (chosen as Placement[]) : null;
}

function enumeratePlacements(clue: Clue, rows: number, cols: number): Placement[] {
  const out: Placement[] = [];
  const sizes = enumerateSizes(clue.kind, clue.size, rows, cols);
  for (const { w, h } of sizes) {
    // The clue cell at (clue.row, clue.col) must lie inside the rectangle.
    // For each (top-left) (r, c) such that r <= clue.row <= r+h-1 and same for col.
    const minR = Math.max(0, clue.row - (h - 1));
    const maxR = Math.min(rows - h, clue.row);
    const minC = Math.max(0, clue.col - (w - 1));
    const maxC = Math.min(cols - w, clue.col);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        out.push({ clue, row: r, col: c, w, h });
      }
    }
  }
  // Sort by descending area so the solver explores larger shapes first;
  // they're more constraining and fail-fast better.
  out.sort((a, b) => area(b) - area(a));
  return out;
}

function enumerateSizes(
  kind: ShapeKind,
  size: number | null,
  rows: number,
  cols: number,
): Array<{ w: number; h: number }> {
  // 'square' means w === h. 'wide' means w > h (any rectangle wider than tall,
  // not just 1×N — e.g. 3×2 is a wide rectangle). 'tall' is the mirror.
  const out: Array<{ w: number; h: number }> = [];
  if (kind === 'square') {
    if (size != null) {
      const s = Math.round(Math.sqrt(size));
      if (s * s === size && s >= 1 && s <= Math.min(rows, cols)) out.push({ w: s, h: s });
    } else {
      for (let s = 1; s <= Math.min(rows, cols); s++) out.push({ w: s, h: s });
    }
  } else if (kind === 'wide') {
    for (let w = 2; w <= cols; w++) {
      for (let h = 1; h < w && h <= rows; h++) {
        if (size != null && w * h !== size) continue;
        out.push({ w, h });
      }
    }
  } else {
    for (let h = 2; h <= rows; h++) {
      for (let w = 1; w < h && w <= cols; w++) {
        if (size != null && w * h !== size) continue;
        out.push({ w, h });
      }
    }
  }
  return out;
}

function area(p: Placement | { w: number; h: number }): number {
  return p.w * p.h;
}

function fits(p: Placement, occupied: Int32Array, cols: number): boolean {
  for (let dr = 0; dr < p.h; dr++) {
    for (let dc = 0; dc < p.w; dc++) {
      if (occupied[(p.row + dr) * cols + (p.col + dc)] !== -1) return false;
    }
  }
  return true;
}

function mark(p: Placement, occupied: Int32Array, cols: number, value: number): void {
  for (let dr = 0; dr < p.h; dr++) {
    for (let dc = 0; dc < p.w; dc++) {
      occupied[(p.row + dr) * cols + (p.col + dc)] = value;
    }
  }
}

function allCovered(occupied: Int32Array): boolean {
  for (let i = 0; i < occupied.length; i++) if (occupied[i] === -1) return false;
  return true;
}
