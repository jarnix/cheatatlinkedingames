import { readBoard } from '../lib/queens/read-board';
import { solve } from '../lib/queens/solve';
import { play } from '../lib/queens/play';
import { autoFire } from '../lib/auto-fire';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/queens/*'],
  main() {
    let fired = false;
    console.log('[queens-cheat] content script loaded');
    autoFire('queens-cheat', () => {
      if (fired) return true;
      const board = readBoard();
      if (!board) return false;
      // Wait until each row has at least one cell with a known color region.
      if (board.regions[0].every((v) => v === -1)) return false;
      fired = true;
      const placement = solve(board);
      if (!placement) {
        console.warn('[queens-cheat] no solution found');
        return true;
      }
      void play(board, placement);
      return true;
    });
  },
});
