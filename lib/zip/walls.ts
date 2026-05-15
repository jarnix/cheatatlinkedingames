export type Rect = { x: number; y: number; w: number; h: number };

export type BlockedEdges = {
  /** 'r,c' present => wall between (r,c) and (r,c+1). */
  blockedH: Set<string>;
  /** 'r,c' present => wall between (r,c) and (r+1,c). */
  blockedV: Set<string>;
};

/**
 * Detect Zip walls from a screenshot. Walls render as ~12px solid black
 * lines between cells; ordinary grid lines are 1px light gray. We sample a
 * band of pixels straddling each interior edge — a wall produces many dark
 * samples, a grid line produces essentially none.
 *
 * `scale` is screenshot-pixels per CSS-pixel (devicePixelRatio, roughly).
 */
export function detectWalls(
  img: ImageData,
  scale: number,
  cellRects: Rect[],
  rows: number,
  cols: number,
): BlockedEdges {
  const blockedH = new Set<string>();
  const blockedV = new Set<string>();

  const darkAt = (cssX: number, cssY: number): boolean => {
    const px = Math.round(cssX * scale);
    const py = Math.round(cssY * scale);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false;
    const i = (py * img.width + px) * 4;
    return img.data[i] + img.data[i + 1] + img.data[i + 2] < 180;
  };

  // Sample a 13px band straddling the edge. `horizontal` = the edge itself is
  // a horizontal line (between vertically adjacent cells).
  const edgeIsWall = (cssX: number, cssY: number, horizontal: boolean): boolean => {
    let dark = 0;
    for (let off = -6; off <= 6; off++) {
      const x = horizontal ? cssX : cssX + off;
      const y = horizontal ? cssY + off : cssY;
      if (darkAt(x, y)) dark++;
    }
    return dark >= 5;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cellRects[r * cols + c];
      if (c + 1 < cols && edgeIsWall(cell.x + cell.w, cell.y + cell.h / 2, false)) {
        blockedH.add(`${r},${c}`);
      }
      if (r + 1 < rows && edgeIsWall(cell.x + cell.w / 2, cell.y + cell.h, true)) {
        blockedV.add(`${r},${c}`);
      }
    }
  }
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
