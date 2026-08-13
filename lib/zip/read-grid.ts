import type { Grid } from './grid';
import { readWalls, adjacencyWithWalls } from './walls';

const CONTAINER_SELECTOR = '[data-testid="interactive-grid"]';
const CELL_SELECTOR = '[data-cell-idx]';

export function readGrid(): Grid | null {
  const container = document.querySelector<HTMLElement>(CONTAINER_SELECTOR);
  if (!container) return null;

  const cellNodes = Array.from(
    container.querySelectorAll<HTMLElement>(CELL_SELECTOR),
  ).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );
  if (cellNodes.length === 0) return null;

  // The board can sit in the DOM without any layout — on the results screen it
  // is present but collapsed to zero size. play() needs real coordinates, so
  // wait for a laid-out grid rather than acting on a degenerate one.
  const firstRect = cellNodes[0].getBoundingClientRect();
  if (firstRect.width === 0 || firstRect.height === 0) return null;

  const total = cellNodes.length;
  const cols = inferCols(container, cellNodes);
  if (!cols || total % cols !== 0) {
    console.warn('[zip-cheat] could not infer grid columns', { total, cols });
    return null;
  }
  const rows = total / cols;

  const waypoints: number[] = [];
  cellNodes.forEach((node, idx) => {
    const num = readWaypointNumber(node);
    if (num != null) waypoints[num - 1] = idx;
  });
  if (waypoints.length === 0 || waypoints.some((v) => v === undefined)) {
    console.warn('[zip-cheat] missing waypoints', waypoints);
    return null;
  }

  const blocked = readWalls(cellNodes, rows, cols);
  const adjacency = adjacencyWithWalls(rows, cols, blocked);

  console.log('[zip-cheat] grid read', {
    rows,
    cols,
    waypoints,
    walls: blocked.blockedH.size + blocked.blockedV.size,
  });
  return { rows, cols, waypoints, adjacency };
}

/**
 * Board size varies (8x8 as of 2026-08), so it has to be measured. Every
 * source here is unreliable in some state, hence the ladder — each result is
 * sanity-checked against the cell count before being accepted.
 */
function inferCols(container: HTMLElement, cells: HTMLElement[]): number | null {
  const total = cells.length;

  // 1. Resolved grid track list. Chrome returns the *specified* value instead
  //    ("repeat(8, 1fr)", which naively splits to 2) whenever the grid has no
  //    layout, so only trust a plain list of track sizes.
  const tracks = getComputedStyle(container).gridTemplateColumns;
  if (tracks && tracks !== 'none' && !tracks.includes('(')) {
    const n = tracks.trim().split(/\s+/).length;
    if (n > 1 && total % n === 0) return n;
  }

  // 2. Row-break scan. Collapses to `total` when the board is unlaid-out, so
  //    require an actual break.
  const top = cells[0].getBoundingClientRect().top;
  let byLayout = 0;
  for (const cell of cells) {
    if (Math.abs(cell.getBoundingClientRect().top - top) > 1) break;
    byLayout++;
  }
  if (byLayout > 0 && byLayout < total && total % byLayout === 0) return byLayout;

  // 3. Inline custom properties — the only layout-independent source. Their
  //    names are hashed on the logged-in build (`--_3115b1f7: 8; --_9747563a: 8;`)
  //    so rows and cols can't be told apart by name; declaration order is
  //    rows-then-cols, so take the last value that divides the cell count.
  const vars = [...(container.getAttribute('style') ?? '').matchAll(/--[\w-]+\s*:\s*(\d+)/g)]
    .map((m) => Number(m[1]));
  for (let i = vars.length - 1; i >= 0; i--) {
    if (vars[i] > 0 && total % vars[i] === 0) return vars[i];
  }

  return null;
}

function readWaypointNumber(node: HTMLElement): number | null {
  const text = (node.textContent ?? '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const label = node.getAttribute('aria-label') ?? '';
  const m = label.match(/(?:Numéro|Numero|Number|Waypoint|N°)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
