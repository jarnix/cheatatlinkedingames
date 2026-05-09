import { readGrid } from '../lib/zip/read-grid';
import { solve } from '../lib/zip/solve';
import { play } from '../lib/zip/play';

const TARGET_DURATION_MS = 1500;

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/zip/*'],
  main() {
    let fired = false;

    const tryFire = async (observer: MutationObserver | null) => {
      if (fired) return;
      const grid = readGrid();
      if (!grid) return;
      fired = true;
      observer?.disconnect();

      const path = solve(grid);
      if (!path) {
        console.warn('[zip-cheat] no solution found');
        return;
      }

      await play(grid, path, TARGET_DURATION_MS);
    };

    const observer = new MutationObserver(() => tryFire(observer));
    observer.observe(document.body, { childList: true, subtree: true });

    void tryFire(observer);

    console.log('[zip-cheat] auto-fire armed (1.5s target)');
  },
});
