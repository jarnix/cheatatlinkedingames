import { readBoard } from '../lib/wend/read-board';
import { solve, buildDictionary } from '../lib/wend/solve';
import { play } from '../lib/wend/play';
import { WORDS } from '../lib/wend/words';
import { autoFire } from '../lib/auto-fire';

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/wend/*'],
  main() {
    let fired = false;
    console.log('[wend-cheat] content script loaded');
    autoFire('wend-cheat', () => {
      if (fired) return true;
      const board = readBoard();
      if (!board) return false;
      fired = true;
      void run(board);
      return true;
    });
  },
});

async function run(board: NonNullable<ReturnType<typeof readBoard>>): Promise<void> {
  // Restricting the dictionary to the puzzle's own word lengths keeps this to
  // a fraction of the shipped list.
  const dict = buildDictionary(WORDS, board.lengths);
  const words = solve(board.rows, board.cols, board.letters, board.lengths, dict);
  if (!words) {
    console.warn('[wend-cheat] no solution found', board.lengths);
    return;
  }
  console.log('[wend-cheat] solved:', words.map((w) => w.word).join(', '));
  await play(board, words);
}
