import { readBoard } from '../lib/sudoku/read-board';
import { solve } from '../lib/sudoku/solve';
import { play } from '../lib/sudoku/play';
import { autoFire } from '../lib/auto-fire';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/mini-sudoku/*'],
  main() {
    let fired = false;
    console.log('[sudoku-cheat] content script loaded');
    autoFire('sudoku-cheat', () => {
      if (fired) return true;
      const board = readBoard();
      if (!board) return false;
      const givenCount = board.givens.flat().filter((v) => v != null).length;
      if (givenCount === 0) return false;
      fired = true;
      const solution = solve(board);
      if (!solution) {
        console.warn('[sudoku-cheat] no solution found');
        return true;
      }
      void play(board, solution);
      return true;
    });
  },
});
