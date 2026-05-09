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
  cellNodes.forEach((node, idx) => {
    const num = readWaypointNumber(node);
    if (num != null) waypoints[num - 1] = idx;
  });
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
  // The grid container has a hashed CSS custom property holding the column count,
  // e.g. style="--ze580797: 8;". The variable name is hashed per-build, so we
  // pull the first integer value from any inline custom property.
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
  const label = node.getAttribute('aria-label');
  if (!label) return null;
  const m = label.match(/\d+/);
  return m ? Number(m[0]) : null;
}
