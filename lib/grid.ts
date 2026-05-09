export type CellIdx = number;

export type Grid = {
  rows: number;
  cols: number;
  /** Cell index for waypoint 1, 2, 3, ... in order. Length = total numbered cells. */
  waypoints: CellIdx[];
  /** For each cell, the indices of its accessible 4-neighbors (walls already filtered out). */
  adjacency: CellIdx[][];
};

export function cellIndex(row: number, col: number, cols: number): CellIdx {
  return row * cols + col;
}

export function rowColOf(idx: CellIdx, cols: number): { row: number; col: number } {
  return { row: Math.floor(idx / cols), col: idx % cols };
}
