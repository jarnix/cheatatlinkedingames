import type { PatchesBoard } from './read-board';
import type { RegionAssignment } from './solve';

type Point = { x: number; y: number };
type Drag = Point[];

export async function play(board: PatchesBoard, assignment: RegionAssignment): Promise<void> {
  const drags: Drag[] = [];
  for (let ci = 0; ci < board.clues.length; ci++) {
    const cells = assignment.regions[ci];
    drags.push(...buildDragsForRegion(board, ci, cells));
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
 * Strategy:
 * - If a Hamiltonian path through the region exists starting at the clue
 *   cell, dispatch a single drag that visits each cell exactly once. The
 *   game counts each touch event as growing the region, so retracing would
 *   over-count and trigger a "region can only contain N cells" rejection.
 * - If no Hamiltonian-from-clue path exists (e.g. the clue is mid-line in a
 *   1xN region), fall back to BFS multi-drag: each step is a 2-cell drag
 *   from a painted cell to a new neighbor.
 */
function buildDragsForRegion(board: PatchesBoard, ci: number, cells: number[]): Drag[] {
  const cellSet = new Set(cells);
  const start = board.clues[ci].cellIdx;
  const cellAt = (idx: number): Point => {
    const el = board.cellElements[idx];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const path = findHamiltonianPath(cellSet, start, board.rows, board.cols);
  if (path) return [path.map(cellAt)];

  // BFS fallback: 2-cell drags from already-painted cells outward.
  const drags: Drag[] = [];
  const painted = new Set<number>([start]);
  const queue: number[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    const r = Math.floor(cur / board.cols), c = cur % board.cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;
      const n = nr * board.cols + nc;
      if (!cellSet.has(n) || painted.has(n)) continue;
      drags.push([cellAt(cur), cellAt(n)]);
      painted.add(n);
      queue.push(n);
    }
  }
  return drags;
}

function findHamiltonianPath(
  cellSet: Set<number>,
  start: number,
  rows: number,
  cols: number,
): number[] | null {
  const visited = new Set<number>([start]);
  const path: number[] = [start];
  function dfs(): boolean {
    if (path.length === cellSet.size) return true;
    const cur = path[path.length - 1];
    const cr = Math.floor(cur / cols), cc = cur % cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const n = nr * cols + nc;
      if (!cellSet.has(n) || visited.has(n)) continue;
      visited.add(n);
      path.push(n);
      if (dfs()) return true;
      path.pop();
      visited.delete(n);
    }
    return false;
  }
  return dfs() ? path : null;
}
