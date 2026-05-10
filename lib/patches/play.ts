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
 * For each region, find a Hamiltonian path through its cells starting at the
 * clue cell. If one exists, emit a single drag. Otherwise, fall back to
 * multi-drag growth (each drag from a painted cell extends to one new cell).
 */
function buildDragsForRegion(board: PatchesBoard, ci: number, cells: number[]): Drag[] {
  const clue = board.clues[ci];
  const cellSet = new Set(cells);
  const path = findHamiltonianPath(cellSet, clue.cellIdx, board.cols);
  const cellAt = (idx: number): Point => {
    const el = board.cellElements[idx];
    const rc = el.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
  };
  if (path) return [path.map(cellAt)];
  // Fallback: BFS from clue, one 2-cell drag per new cell.
  const drags: Drag[] = [];
  const painted = new Set<number>([clue.cellIdx]);
  const queue: number[] = [clue.cellIdx];
  while (queue.length) {
    const cur = queue.shift()!;
    const r = Math.floor(cur / board.cols), c = cur % board.cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;
      const nIdx = nr * board.cols + nc;
      if (!cellSet.has(nIdx) || painted.has(nIdx)) continue;
      drags.push([cellAt(cur), cellAt(nIdx)]);
      painted.add(nIdx);
      queue.push(nIdx);
    }
  }
  return drags;
}

function findHamiltonianPath(cellSet: Set<number>, start: number, cols: number): number[] | null {
  const visited = new Set<number>([start]);
  const path: number[] = [start];
  function dfs(): boolean {
    if (path.length === cellSet.size) return true;
    const cur = path[path.length - 1];
    const cr = Math.floor(cur / cols), cc = cur % cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cr + dr, nc = cc + dc;
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
