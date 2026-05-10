import type { PatchesBoard } from './read-board';

export type RegionAssignment = {
  /** For each cell index, the index of the clue/region it belongs to. */
  ownerOf: Int32Array;
  /** For each clue index (in board.clues order), the set of cell indices in
   *  that region. */
  regions: number[][];
};

/**
 * Tile every cell. Each clue's region is grown so that:
 *  - 'square' kind: the region's cells fill an N×N bounding box (N≥1).
 *  - 'wide' kind:   the region fills a w×h bounding box with w > h.
 *  - 'tall' kind:   the region fills a w×h bounding box with h > w.
 *  - 'freeform' kind: any connected polyomino of the clue's size.
 *  - if `clue.size` is set, the region has exactly that many cells.
 *
 * Uses cell-by-cell backtracking that grows regions from clue cells outward.
 */
export function solve(board: PatchesBoard): RegionAssignment | null {
  const { rows, cols, clues } = board;
  const total = rows * cols;
  const ownerOf = new Int32Array(total).fill(-1);
  const regions: Set<number>[] = clues.map(() => new Set());
  for (let ci = 0; ci < clues.length; ci++) {
    const c = clues[ci];
    ownerOf[c.cellIdx] = ci;
    regions[ci].add(c.cellIdx);
  }

  const adjOf = (i: number): number[] => {
    const r = Math.floor(i / cols), c = i % cols;
    const out: number[] = [];
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    return out;
  };

  const bbox = (region: Set<number>): { minR: number; maxR: number; minC: number; maxC: number } => {
    let minR = rows, maxR = -1, minC = cols, maxC = -1;
    for (const idx of region) {
      const r = Math.floor(idx / cols), c = idx % cols;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    return { minR, maxR, minC, maxC };
  };

  // Quick partial validity after tentatively adding a cell to a region.
  function partialValid(ci: number): boolean {
    const region = regions[ci];
    const clue = clues[ci];
    if (clue.size != null && region.size > clue.size) return false;
    if (clue.kind === 'freeform') return true;
    // Rectangle kinds: bounding box cells must be either in this region or
    // still unclaimed (i.e. claimable later).
    const { minR, maxR, minC, maxC } = bbox(region);
    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    if (clue.kind === 'square' && w !== h) {
      // Bounding box is non-square; could become square only by growing the
      // shorter dimension. That's allowed if there's still room.
      // But the bbox itself must still be enclosable in a square — i.e. once
      // the region is "complete", w must equal h. We approximate by allowing
      // the bbox to be non-square mid-growth, but reject if it exceeds size cap.
      if (clue.size != null) {
        const targetSide = Math.round(Math.sqrt(clue.size));
        if (targetSide * targetSide !== clue.size) return false;
        if (w > targetSide || h > targetSide) return false;
      }
    }
    if (clue.kind === 'wide' && h > w + 0) {
      // Could still grow wider; allow for now if sized clue still has room.
    }
    if (clue.kind === 'tall' && w > h + 0) {
      // Same.
    }
    // bbox cells must not be claimed by other regions.
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const idx = r * cols + c;
        if (region.has(idx)) continue;
        if (ownerOf[idx] !== -1) return false;
      }
    }
    return true;
  }

  function finalValid(): boolean {
    for (let ci = 0; ci < clues.length; ci++) {
      const region = regions[ci];
      const clue = clues[ci];
      if (clue.size != null && region.size !== clue.size) return false;
      if (clue.kind === 'freeform') continue;
      const { minR, maxR, minC, maxC } = bbox(region);
      const w = maxC - minC + 1;
      const h = maxR - minR + 1;
      if (region.size !== w * h) return false;
      if (clue.kind === 'square' && w !== h) return false;
      if (clue.kind === 'wide' && w <= h) return false;
      if (clue.kind === 'tall' && h <= w) return false;
    }
    return true;
  }

  let claimed = clues.length;

  function backtrack(): boolean {
    if (claimed === total) return finalValid();
    // Pick the most-constrained unclaimed cell that is adjacent to ≥1 region.
    let bestCell = -1;
    let bestOpts: number[] = [];
    let bestCount = Infinity;
    for (let i = 0; i < total; i++) {
      if (ownerOf[i] !== -1) continue;
      const candSet = new Set<number>();
      for (const n of adjOf(i)) {
        if (ownerOf[n] !== -1) candSet.add(ownerOf[n]);
      }
      if (candSet.size === 0) continue;
      const valid: number[] = [];
      for (const ci of candSet) {
        const clue = clues[ci];
        if (clue.size != null && regions[ci].size >= clue.size) continue;
        valid.push(ci);
      }
      if (valid.length === 0) return false;
      if (valid.length < bestCount) {
        bestCount = valid.length;
        bestCell = i;
        bestOpts = valid;
        if (bestCount === 1) break;
      }
    }
    if (bestCell === -1) {
      // No cell adjacent to any region: there are unclaimed cells unreachable.
      return false;
    }
    for (const ci of bestOpts) {
      regions[ci].add(bestCell);
      ownerOf[bestCell] = ci;
      claimed++;
      if (partialValid(ci) && backtrack()) return true;
      regions[ci].delete(bestCell);
      ownerOf[bestCell] = -1;
      claimed--;
    }
    return false;
  }

  if (!backtrack()) return null;
  return {
    ownerOf,
    regions: regions.map((s) => [...s]),
  };
}
