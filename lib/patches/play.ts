import type { PatchesBoard } from './read-board';
import type { RegionAssignment } from './solve';

type Point = { x: number; y: number };
type Drag = Point[];

export async function play(board: PatchesBoard, assignment: RegionAssignment): Promise<void> {
  const drags: Drag[] = [];
  for (let ci = 0; ci < board.clues.length; ci++) {
    const cells = assignment.regions[ci];
    drags.push(buildDragForRegion(board, ci, cells));
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
 * Build a single touch path that starts at the clue cell and visits every
 * cell of the region. The path may retrace through already-visited cells
 * when a branch dead-ends — that's fine because the game's gesture model
 * only paints cells the gesture passes over for the first time.
 */
function buildDragForRegion(board: PatchesBoard, ci: number, cells: number[]): Drag {
  const cellSet = new Set(cells);
  const start = board.clues[ci].cellIdx;
  const path = traceRegion(cellSet, start, board.rows, board.cols);
  return path.map((idx) => {
    const el = board.cellElements[idx];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

function traceRegion(cellSet: Set<number>, start: number, rows: number, cols: number): number[] {
  const visited = new Set<number>([start]);
  const path: number[] = [start];
  function visit(cur: number) {
    const cr = Math.floor(cur / cols), cc = cur % cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const n = nr * cols + nc;
      if (!cellSet.has(n) || visited.has(n)) continue;
      visited.add(n);
      path.push(n);
      visit(n);
      // After exploring a branch, if there are still unvisited cells in the
      // region, retrace to the current cell so we can try another direction.
      if (visited.size < cellSet.size) path.push(cur);
    }
  }
  visit(start);
  return path;
}
