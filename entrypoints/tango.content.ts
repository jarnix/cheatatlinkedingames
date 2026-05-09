import { readBoard } from '../lib/tango/read-board';
import { solve } from '../lib/tango/solve';
import { play } from '../lib/tango/play';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/tango/*'],
  main() {
    let fired = false;

    const tryFire = async (observer: MutationObserver | null) => {
      if (fired) return;
      const board = readBoard();
      if (!board) return;
      const givenCount = board.givens.flat().filter((v) => v != null).length;
      if (givenCount === 0) return;
      fired = true;
      observer?.disconnect();

      const solution = solve(board);
      if (!solution) {
        console.warn('[tango-cheat] no solution found');
        return;
      }

      await play(board, solution);
    };

    const observer = new MutationObserver(() => tryFire(observer));
    observer.observe(document.body, { childList: true, subtree: true });
    void tryFire(observer);

    console.log('[tango-cheat] auto-fire armed');
  },
});
