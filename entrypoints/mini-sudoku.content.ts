import { readBoard } from '../lib/sudoku/read-board';
import { solve } from '../lib/sudoku/solve';
import { play } from '../lib/sudoku/play';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/mini-sudoku/*'],
  main() {
    let fired = false;

    const tryFire = async (observer: MutationObserver | null) => {
      if (fired) return;
      const board = readBoard();
      if (!board) return;
      // Wait until the puzzle's givens have populated; the grid mounts empty
      // for a tick before LinkedIn fills the clues.
      const givenCount = board.givens.flat().filter((v) => v != null).length;
      if (givenCount === 0) return;
      fired = true;
      observer?.disconnect();

      const solution = solve(board);
      if (!solution) {
        console.warn('[sudoku-cheat] no solution found');
        return;
      }

      await play(board, solution);
    };

    const observer = new MutationObserver(() => tryFire(observer));
    observer.observe(document.body, { childList: true, subtree: true });
    void tryFire(observer);

    console.log('[sudoku-cheat] auto-fire armed');
  },
});
