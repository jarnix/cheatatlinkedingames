import { readBoard } from '../lib/patches/read-board';
import { solve } from '../lib/patches/solve';
import { play } from '../lib/patches/play';
import { autoFire } from '../lib/auto-fire';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/patches/*'],
  main() {
    let fired = false;
    console.log('[patches-cheat] content script loaded');
    autoFire('patches-cheat', () => {
      if (fired) return true;
      const board = readBoard();
      if (!board || board.clues.length === 0) return false;
      fired = true;
      const assignment = solve(board);
      if (!assignment) {
        console.warn('[patches-cheat] no solution found');
        return true;
      }
      void play(board, assignment);
      return true;
    });
  },
});
