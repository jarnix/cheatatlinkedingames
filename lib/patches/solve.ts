import type { Clue, PatchesBoard } from './read-board';

export type RegionAssignment = {
  /** For each cell index, the index of the clue/region it belongs to. */
  ownerOf: Int32Array;
  /** For each clue index, the set of cell indices in that region. */
  regions: number[][];
};

/**
 * Tile every cell of the board with regions that satisfy each clue:
 *  - 'square' kind: w === h (any size)
 *  - 'wide'   kind: w >  h (any aspect)
 *  - 'tall'   kind: h >  w (any aspect)
 *  - 'freeform' kind: any contiguous polyomino of the clue's required size
 *  - if `clue.size` is set, the region has exactly that many cells
 *
 * Strategy:
 * 1. Enumerate every valid rectangle placement per non-freeform clue.
 *    These counts stay small (tens per clue at most).
 * 2. Backtrack over combinations of those placements, requiring that they
 *    don't overlap and that their cumulative size equals
 *    rows*cols minus the sum of sized freeform sizes.
 * 3. For each viable rectangle assignment, run a cell-by-cell tiler on the
 *    remaining cells using only the freeform clues. Freeforms have no shape
 *    constraint (only size), so this stage is fast.
 */
export function solve(board: PatchesBoard): RegionAssignment | null {
  const { rows, cols, clues } = board;
  const TOTAL = rows * cols;
  const allClueCells = new Set(clues.map((c) => c.cellIdx));

  const adj = (i: number): number[] => {
    const r = Math.floor(i / cols), c = i % cols;
    const out: number[] = [];
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    return out;
  };

  // 'freeform' is just a rectangle of any aspect at the given size, not a
  // polyomino — the game's drag interpreter treats every gesture as a
  // start→end bounding rectangle, so all four kinds are rectangle clues.
  const rectIndices: number[] = clues.map((_, i) => i);
  const freeformIndices: number[] = [];
  const rectTotal = TOTAL;

  const rectPlacements: number[][][] = rectIndices.map((idx) =>
    enumerateRects(clues[idx], rows, cols, allClueCells),
  );
  // Order by ascending placement count so the most constrained clue is
  // chosen first.
  const rectOrder = rectIndices.map((_, i) => i);
  rectOrder.sort((a, b) => rectPlacements[a].length - rectPlacements[b].length);

  const ownerOf = new Int32Array(TOTAL).fill(-1);
  for (let i = 0; i < clues.length; i++) ownerOf[clues[i].cellIdx] = i;
  const chosenRect: (number[] | null)[] = rectIndices.map(() => null);
  const claimedRectCells = new Set<number>();

  function tryRectangles(orderIdx: number, claimedSize: number): boolean {
    if (orderIdx === rectIndices.length) {
      if (claimedSize !== rectTotal) return false;
      return tryFreeforms();
    }
    const rectIdx = rectOrder[orderIdx];
    const clueGlobalIdx = rectIndices[rectIdx];
    const ownClueCell = clues[clueGlobalIdx].cellIdx;
    for (const placement of rectPlacements[rectIdx]) {
      if (claimedSize + placement.length > rectTotal) continue;
      let bad = false;
      for (const c of placement) {
        if (c === ownClueCell) continue;
        if (claimedRectCells.has(c) || allClueCells.has(c)) { bad = true; break; }
      }
      if (bad) continue;
      for (const c of placement) if (c !== ownClueCell) {
        claimedRectCells.add(c);
        ownerOf[c] = clueGlobalIdx;
      }
      chosenRect[rectIdx] = placement;
      if (tryRectangles(orderIdx + 1, claimedSize + placement.length)) return true;
      for (const c of placement) if (c !== ownClueCell) {
        claimedRectCells.delete(c);
        ownerOf[c] = -1;
      }
      chosenRect[rectIdx] = null;
    }
    return false;
  }

  function tryFreeforms(): boolean {
    // Available cells: TOTAL minus rectangle-claimed minus all clue cells.
    const available = new Set<number>();
    for (let i = 0; i < TOTAL; i++) {
      if (claimedRectCells.has(i)) continue;
      if (allClueCells.has(i)) continue;
      available.add(i);
    }
    const freeformRegions: Set<number>[] = freeformIndices.map(
      (gi) => new Set([clues[gi].cellIdx]),
    );

    function backtrack(): boolean {
      let bestCell = -1, bestOpts: number[] = [], bestN = Infinity;
      for (const i of available) {
        if (ownerOf[i] !== -1) continue;
        const cands = new Set<number>();
        for (const n of adj(i)) {
          const owner = ownerOf[n];
          if (owner === -1) continue;
          if (clues[owner].kind !== 'freeform') continue;
          const localIdx = freeformIndices.indexOf(owner);
          if (localIdx === -1) continue;
          const c = clues[owner];
          if (c.size != null && freeformRegions[localIdx].size >= c.size) continue;
          cands.add(owner);
        }
        if (cands.size === 0) continue;
        const arr = [...cands];
        if (arr.length < bestN) {
          bestN = arr.length;
          bestCell = i;
          bestOpts = arr;
          if (bestN === 1) break;
        }
      }
      if (bestCell === -1) {
        // Done if all available cells are claimed and freeform sizes match.
        for (const i of available) if (ownerOf[i] === -1) return false;
        for (let li = 0; li < freeformIndices.length; li++) {
          const c = clues[freeformIndices[li]];
          if (c.size != null && freeformRegions[li].size !== c.size) return false;
        }
        return true;
      }
      for (const owner of bestOpts) {
        const localIdx = freeformIndices.indexOf(owner);
        freeformRegions[localIdx].add(bestCell);
        ownerOf[bestCell] = owner;
        if (backtrack()) return true;
        freeformRegions[localIdx].delete(bestCell);
        ownerOf[bestCell] = -1;
      }
      return false;
    }

    return backtrack();
  }

  if (rectIndices.length === 0) {
    if (!tryFreeforms()) return null;
  } else {
    if (!tryRectangles(0, 0)) return null;
  }

  const regions: number[][] = clues.map(() => []);
  for (let i = 0; i < TOTAL; i++) {
    const o = ownerOf[i];
    if (o !== -1) regions[o].push(i);
  }
  return { ownerOf, regions };
}

function enumerateRects(
  clue: Clue,
  rows: number,
  cols: number,
  allClueCells: Set<number>,
): number[][] {
  const cr = clue.row, cc = clue.col;
  const sizes: { w: number; h: number }[] = [];
  if (clue.kind === 'square') {
    if (clue.size != null) {
      const s = Math.round(Math.sqrt(clue.size));
      if (s * s === clue.size && s >= 1 && s <= Math.min(rows, cols)) sizes.push({ w: s, h: s });
    } else {
      for (let s = 1; s <= Math.min(rows, cols); s++) sizes.push({ w: s, h: s });
    }
  } else if (clue.kind === 'wide') {
    for (let w = 2; w <= cols; w++) {
      for (let h = 1; h < w && h <= rows; h++) {
        if (clue.size != null && w * h !== clue.size) continue;
        sizes.push({ w, h });
      }
    }
  } else if (clue.kind === 'tall') {
    for (let h = 2; h <= rows; h++) {
      for (let w = 1; w < h && w <= cols; w++) {
        if (clue.size != null && w * h !== clue.size) continue;
        sizes.push({ w, h });
      }
    }
  } else if (clue.kind === 'freeform') {
    // Any rectangle whose area matches the size. Both square and non-square
    // are allowed (the legend's "any of the above" wildcard).
    if (clue.size == null) return []; // shouldn't happen — freeforms always carry a number
    for (let w = 1; w <= cols; w++) {
      for (let h = 1; h <= rows; h++) {
        if (w * h !== clue.size) continue;
        sizes.push({ w, h });
      }
    }
  }
  const out: number[][] = [];
  for (const { w, h } of sizes) {
    // Only placements where the clue sits at one of the four corners. The
    // game's drag interpreter creates a rectangle from touchStart to touchEnd,
    // so single-drag play needs the clue to be at a corner — otherwise we'd
    // have to multi-drag, and the game drops most chained drags.
    const candidateTops = new Set<number>();
    if (cr + h <= rows) candidateTops.add(cr);              // clue at top edge
    if (cr - h + 1 >= 0) candidateTops.add(cr - h + 1);     // clue at bottom edge
    const candidateLefts = new Set<number>();
    if (cc + w <= cols) candidateLefts.add(cc);             // clue at left edge
    if (cc - w + 1 >= 0) candidateLefts.add(cc - w + 1);    // clue at right edge
    for (const r of candidateTops) {
      for (const c of candidateLefts) {
        const cells: number[] = [];
        let bad = false;
        for (let dr = 0; dr < h && !bad; dr++) {
          for (let dc = 0; dc < w && !bad; dc++) {
            const idx = (r + dr) * cols + (c + dc);
            if (allClueCells.has(idx) && idx !== clue.cellIdx) { bad = true; break; }
            cells.push(idx);
          }
        }
        if (!bad) out.push(cells);
      }
    }
  }
  return out;
}
