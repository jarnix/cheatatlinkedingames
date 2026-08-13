export type BlockedEdges = {
  /** 'r,c' present => wall between (r,c) and (r,c+1). */
  blockedH: Set<string>;
  /** 'r,c' present => wall between (r,c) and (r+1,c). */
  blockedV: Set<string>;
};

/** A wall renders as a 12px border; ordinary cell edges are 1px or 0. */
const WALL_MIN_PX = 6;

/**
 * Read Zip walls out of the DOM.
 *
 * The logged-in build ships hashed class names (`_564e6d46`, `b05322a4`, ...)
 * that change on every LinkedIn deploy, so classes are useless as selectors.
 * What *is* stable is how a wall is painted: each walled cell holds an overlay
 * `<div>` whose `::after` pseudo-element carries a thick border on exactly one
 * side. One overlay per wall — a cell walled on two sides has two.
 *
 * Reading computed style is also why this no longer needs a screenshot: the
 * old pixel-sampling path had to attach the debugger to capture the viewport,
 * and the "started debugging this browser" banner shifts the page down between
 * measuring the cells and taking the shot.
 */
export function readWalls(
  cells: HTMLElement[],
  rows: number,
  cols: number,
): BlockedEdges {
  const blockedH = new Set<string>();
  const blockedV = new Set<string>();

  cells.forEach((cell, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    for (const child of cell.querySelectorAll('*')) {
      const after = getComputedStyle(child, '::after');
      if (after.content === 'none') continue;
      const px = (v: string) => parseFloat(v) || 0;
      // The wall sits on the named side of *this* cell. Vertical walls are
      // mirrored onto both neighbours, horizontal ones generally are not;
      // normalising every side handles either without caring which.
      if (px(after.borderRightWidth) >= WALL_MIN_PX && c + 1 < cols) blockedH.add(`${r},${c}`);
      if (px(after.borderLeftWidth) >= WALL_MIN_PX && c > 0) blockedH.add(`${r},${c - 1}`);
      if (px(after.borderBottomWidth) >= WALL_MIN_PX && r + 1 < rows) blockedV.add(`${r},${c}`);
      if (px(after.borderTopWidth) >= WALL_MIN_PX && r > 0) blockedV.add(`${r - 1},${c}`);
    }
  });

  return { blockedH, blockedV };
}

/** Build a 4-neighbour adjacency list with blocked edges removed. */
export function adjacencyWithWalls(
  rows: number,
  cols: number,
  blocked: BlockedEdges,
): number[][] {
  const adjacency: number[][] = [];
  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const neighbors: number[] = [];
    if (r > 0 && !blocked.blockedV.has(`${r - 1},${c}`)) neighbors.push(i - cols);
    if (r < rows - 1 && !blocked.blockedV.has(`${r},${c}`)) neighbors.push(i + cols);
    if (c > 0 && !blocked.blockedH.has(`${r},${c - 1}`)) neighbors.push(i - 1);
    if (c < cols - 1 && !blocked.blockedH.has(`${r},${c}`)) neighbors.push(i + 1);
    adjacency.push(neighbors);
  }
  return adjacency;
}
