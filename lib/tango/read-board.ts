export type Cell = 0 | 1 | null; // 0 = sun, 1 = moon, null = empty
export type EdgeKind = 'equal' | 'cross';

export type TangoBoard = {
  rows: number;
  cols: number;
  /** [row][col] -> 0 (sun) | 1 (moon) | null (empty). */
  givens: Cell[][];
  /** Edges keyed by 'h:r:c' = horizontal edge between (r,c) and (r,c+1), or
   *  'v:r:c' = vertical edge between (r,c) and (r+1,c). */
  edges: Map<string, EdgeKind>;
  cellElements: HTMLElement[];
};

const SUN = 'cell-zero';
const MOON = 'cell-one';

export function readBoard(): TangoBoard | null {
  const grid = document.querySelector<HTMLElement>('[data-testid="interactive-grid"]');
  if (!grid) return null;

  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-cell-idx]')).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );
  if (cells.length === 0) return null;

  const styleVar = (grid.getAttribute('style') ?? '').match(/--[\w-]+\s*:\s*(\d+)/);
  const cols = styleVar ? Number(styleVar[1]) : Math.round(Math.sqrt(cells.length));
  if (!cols || cells.length % cols !== 0) return null;
  const rows = cells.length / cols;

  const givens: Cell[][] = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));
  for (let i = 0; i < cells.length; i++) {
    const inner = cells[i].querySelector<HTMLElement>('[data-testid]');
    const id = inner?.getAttribute('data-testid');
    if (id === SUN) givens[Math.floor(i / cols)][i % cols] = 0;
    else if (id === MOON) givens[Math.floor(i / cols)][i % cols] = 1;
  }

  // Edges sit between two cells. Identify by closest pair of cells.
  const edges = new Map<string, EdgeKind>();
  const cellRects = cells.map((c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  for (const el of document.querySelectorAll<HTMLElement>(
    '[data-testid="edge-cross"], [data-testid="edge-equal"]',
  )) {
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    let bestPair: [number, number] | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const ri = Math.floor(i / cols), ci = i % cols;
        const rj = Math.floor(j / cols), cj = j % cols;
        if (Math.abs(ri - rj) + Math.abs(ci - cj) !== 1) continue; // adjacent only
        const mx = (cellRects[i].x + cellRects[j].x) / 2;
        const my = (cellRects[i].y + cellRects[j].y) / 2;
        const d = Math.hypot(ex - mx, ey - my);
        if (d < bestDist) { bestDist = d; bestPair = [i, j]; }
      }
    }
    if (!bestPair) continue;
    const [a, b] = bestPair;
    const ar = Math.floor(a / cols), ac = a % cols;
    const br = Math.floor(b / cols), bc = b % cols;
    const key = ar === br ? `h:${ar}:${Math.min(ac, bc)}` : `v:${Math.min(ar, br)}:${ac}`;
    const kind: EdgeKind = el.getAttribute('data-testid') === 'edge-equal' ? 'equal' : 'cross';
    edges.set(key, kind);
  }

  return { rows, cols, givens, edges, cellElements: cells };
}
