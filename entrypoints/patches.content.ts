import { readBoard } from '../lib/patches/read-board';
import { solve } from '../lib/patches/solve';
import { play } from '../lib/patches/play';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/patches/*'],
  main() {
    let fired = false;

    const tryFire = async (observer: MutationObserver | null) => {
      if (fired) return;
      const board = readBoard();
      if (!board || board.clues.length === 0) return;
      fired = true;
      observer?.disconnect();

      const placements = solve(board);
      if (!placements) {
        console.warn('[patches-cheat] no solution found');
        return;
      }

      await play(board, placements);
    };

    const observer = new MutationObserver(() => tryFire(observer));
    observer.observe(document.body, { childList: true, subtree: true });
    void tryFire(observer);

    console.log('[patches-cheat] auto-read armed');
  },
});
