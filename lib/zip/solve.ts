import type { CellIdx, Grid } from './grid';

/**
 * Hamiltonian path through every cell, visiting the waypoints in order.
 * Returns the path as cell indices, or null if no solution exists.
 */
export function solve(grid: Grid): CellIdx[] | null {
  const total = grid.rows * grid.cols;
  if (grid.waypoints.length === 0) return null;

  const waypointAt = new Int32Array(total).fill(-1);
  grid.waypoints.forEach((idx, i) => {
    waypointAt[idx] = i;
  });

  const visited = new Uint8Array(total);
  const path: CellIdx[] = new Array(total);
  const target = grid.waypoints.length;

  function dfs(current: CellIdx, depth: number, nextWaypoint: number): boolean {
    const wp = waypointAt[current];
    let newNextWaypoint = nextWaypoint;
    if (wp !== -1) {
      if (wp !== nextWaypoint) return false;
      newNextWaypoint = nextWaypoint + 1;
    }

    visited[current] = 1;
    path[depth] = current;

    if (depth + 1 === total) {
      if (newNextWaypoint === target) return true;
      visited[current] = 0;
      return false;
    }

    for (const neighbor of grid.adjacency[current]) {
      if (!visited[neighbor] && dfs(neighbor, depth + 1, newNextWaypoint)) return true;
    }

    visited[current] = 0;
    return false;
  }

  return dfs(grid.waypoints[0], 0, 0) ? path : null;
}
