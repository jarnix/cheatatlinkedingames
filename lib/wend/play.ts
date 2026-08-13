import type { WendBoard } from './read-board';
import type { WendWord } from './solve';

/**
 * Each word is entered by dragging through its path, exactly like Zip's trail —
 * the grid listens for touchstart/touchmove/touchend and ignores mouse input.
 * Words already showing in a slot are skipped: their tiles are spent, so
 * re-dragging them would fail.
 */
export async function play(board: WendBoard, words: WendWord[]): Promise<void> {
  const alreadyIn = new Set(board.solved.filter(Boolean));
  const todo = words.filter((w) => !alreadyIn.has(w.word));
  if (todo.length === 0) {
    console.log('[wend-cheat] every word already on the board');
    return;
  }

  const drags = todo.map((w) =>
    w.path.map((idx) => {
      const r = board.cellElements[idx].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );

  console.log(`[wend-cheat] playing ${todo.map((w) => w.word).join(', ')}`);

  const response = (await browser.runtime.sendMessage({
    type: 'wend-play',
    drags,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[wend-cheat] play failed:', response?.error ?? 'no response');
  }
}
