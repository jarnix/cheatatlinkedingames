import type { Grid } from './grid';

const CONTAINER_SELECTOR = '[data-testid="interactive-grid"]';
const CELL_SELECTOR = '[data-cell-idx]';

export function readGrid(): Grid | null {
  const container = document.querySelector<HTMLElement>(CONTAINER_SELECTOR);
  if (!container) return null;

  const cellNodes = Array.from(
    container.querySelectorAll<HTMLElement>(CELL_SELECTOR),
  ).sort(
    (a, b) =>
      Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );
  if (cellNodes.length === 0) return null;

  const total = cellNodes.length;
  const cols = inferColsFromStyleVar(container) ?? inferColsFromLayout(cellNodes);
  if (!cols || total % cols !== 0) {
    console.warn('[zip-cheat] could not infer grid columns', { total, cols });
    return null;
  }
  const rows = total / cols;

  const waypoints: number[] = [];
  const detected: Array<{ idx: number; num: number; text: string; aria: string | null }> = [];
  cellNodes.forEach((node, idx) => {
    const num = readWaypointNumber(node);
    if (num != null) {
      waypoints[num - 1] = idx;
      detected.push({
        idx,
        num,
        text: (node.textContent ?? '').trim().slice(0, 40),
        aria: node.getAttribute('aria-label'),
      });
    }
  });
  console.log('[zip-cheat] waypoint cells detected:', detected);
  if (waypoints.length === 0 || waypoints.some((v) => v === undefined)) {
    console.warn('[zip-cheat] missing waypoints', waypoints);
    return null;
  }

  const adjacency: number[][] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const neighbors: number[] = [];
    if (row > 0) neighbors.push(i - cols);
    if (row < rows - 1) neighbors.push(i + cols);
    if (col > 0) neighbors.push(i - 1);
    if (col < cols - 1) neighbors.push(i + 1);
    // TODO: filter out neighbors blocked by a wall — wall encoding TBD.
    adjacency.push(neighbors);
  }

  console.log('[zip-cheat] grid read', { rows, cols, waypoints });
  return { rows, cols, waypoints, adjacency };
}

function inferColsFromStyleVar(container: HTMLElement): number | null {
  const inline = container.getAttribute('style') ?? '';
  const m = inline.match(/--[\w-]+\s*:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function inferColsFromLayout(cells: HTMLElement[]): number | null {
  const firstTop = cells[0].offsetTop;
  let cols = 0;
  for (const cell of cells) {
    if (cell.offsetTop !== firstTop) break;
    cols++;
  }
  return cols || null;
}

function readWaypointNumber(node: HTMLElement): number | null {
  // Prefer the visible digit in the cell text — that is locale-independent.
  // aria-label on some locales reads "Row 3, column 7" first and the cell's
  // number second, so a generic /\d+/ would grab the row number instead of
  // the waypoint.
  const text = (node.textContent ?? '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  // Aria fallback. Match a digit that immediately follows a "number" keyword,
  // not an arbitrary digit anywhere in the label.
  const label = node.getAttribute('aria-label') ?? '';
  const m = label.match(/(?:Numéro|Numero|Number|Waypoint|N°)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
