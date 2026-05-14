import { readBoard } from '../lib/tango/read-board';
import { solve } from '../lib/tango/solve';
import { play } from '../lib/tango/play';
import { autoFire } from '../lib/auto-fire';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/tango/*'],
  main() {
    let fired = false;
    console.log('[tango-cheat] content script loaded');
    autoFire('tango-cheat', () => {
      if (fired) return true;
      const board = readBoard();
      if (!board) return false;
      const givenCount = board.givens.flat().filter((v) => v != null).length;
      if (givenCount === 0) return false;
      fired = true;
      const solution = solve(board);
      if (!solution) {
        console.warn('[tango-cheat] no solution found');
        return true;
      }
      void play(board, solution);
      return true;
    });
  },
});
