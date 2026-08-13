import { readGrid } from '../lib/zip/read-grid';
import { solve } from '../lib/zip/solve';
import { play } from '../lib/zip/play';
import { autoFire } from '../lib/auto-fire';

const TARGET_DURATION_MS = 1500;

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/zip/*'],
  main() {
    let fired = false;
    console.log('[zip-cheat] content script loaded');
    autoFire('zip-cheat', () => {
      if (fired) return true;
      const grid = readGrid();
      if (!grid) return false;
      fired = true;
      void run(grid);
      return true;
    });
  },
});

async function run(grid: NonNullable<ReturnType<typeof readGrid>>): Promise<void> {
  const path = solve(grid);
  if (!path) {
    console.warn('[zip-cheat] no solution found');
    return;
  }
  await play(grid, path, TARGET_DURATION_MS);
}
