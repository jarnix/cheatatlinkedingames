import type { Grid } from './grid';
import type { Rect } from './walls';

const CONTAINER_SELECTOR = '[data-testid="interactive-grid"]';
const CELL_SELECTOR = '[data-cell-idx]';

export type ZipRead = {
  /** Grid with full 4-neighbour adjacency (walls NOT yet applied). */
  grid: Grid;
  /** Viewport-space bounding rect of each cell, in cell-index order. */
  cellRects: Rect[];
};

export function readGrid(): ZipRead | null {
  const container = document.querySelector<HTMLElement>(CONTAINER_SELECTOR);
  if (!container) return null;

  const cellNodes = Array.from(
    container.querySelectorAll<HTMLElement>(CELL_SELECTOR),
  ).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
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
  const detected: Array<{ idx: number; num: number; text: string }> = [];
  cellNodes.forEach((node, idx) => {
    const num = readWaypointNumber(node);
    if (num != null) {
      waypoints[num - 1] = idx;
      detected.push({ idx, num, text: (node.textContent ?? '').trim().slice(0, 20) });
    }
  });
  console.log('[zip-cheat] waypoint cells detected:', detected);
  if (waypoints.length === 0 || waypoints.some((v) => v === undefined)) {
    console.warn('[zip-cheat] missing waypoints', waypoints);
    return null;
  }

  // Full 4-neighbour adjacency; walls are applied later from a screenshot.
  const adjacency: number[][] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const neighbors: number[] = [];
    if (row > 0) neighbors.push(i - cols);
    if (row < rows - 1) neighbors.push(i + cols);
    if (col > 0) neighbors.push(i - 1);
    if (col < cols - 1) neighbors.push(i + 1);
    adjacency.push(neighbors);
  }

  const cellRects: Rect[] = cellNodes.map((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });

  console.log('[zip-cheat] grid read', { rows, cols, waypoints });
  return { grid: { rows, cols, waypoints, adjacency }, cellRects };
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
  const text = (node.textContent ?? '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const label = node.getAttribute('aria-label') ?? '';
  const m = label.match(/(?:Numéro|Numero|Number|Waypoint|N°)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
