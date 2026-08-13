import { readBoard } from '../lib/queens/read-board';
import { solve } from '../lib/queens/solve';
import { play } from '../lib/queens/play';
import { autoFire } from '../lib/auto-fire';

/**
 * Solving the instant the board mounts makes LinkedIn reject the save: the
 * payload goes up with `gameBoardTimeElapsed: 0` and the server answers
 * `Failed to update game state`, surfaced as the "There was an issue saving
 * your game" toast. Worse, the rejected state is cached in localStorage under
 * `play:gameState:(<profile>,3,<puzzle>)`, so every reload replays the same
 * doomed save — clear those keys to break out of it.
 *
 * A zero clock is the trigger, and it is the only field that mattered: a save
 * carrying the same truncated 3-of-9 `queensSolveOrderBinding` was accepted
 * once the clock was non-zero. So gate on the game's own clock rather than a
 * fixed delay, and wait no longer than the game itself needs.
 *
 * Threshold unverified: 0 is proven to fail and ~4min proven to work; the
 * puzzle completed before the range between could be searched. Raise the
 * override below if the toast comes back.
 */
const DEFAULT_MIN_ELAPSED_S = 5;
/** Tunable at runtime — no rebuild/extension reload needed:
 *  `localStorage['queens-cheat.minElapsedS'] = '45'` */
const OVERRIDE_KEY = 'queens-cheat.minElapsedS';

function minElapsedSeconds(): number {
  const raw = Number(localStorage.getItem(OVERRIDE_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MIN_ELAPSED_S;
}

/**
 * Seconds on the game clock, or null if it isn't running yet. The timer span
 * has hashed classes, but its aria-label ("3 minutes 07 seconds") is stable.
 */
function readElapsedSeconds(): number | null {
  for (const el of document.querySelectorAll<HTMLElement>('[aria-label]')) {
    const m = (el.getAttribute('aria-label') ?? '').match(
      /(\d+)\s*minutes?\s+(\d+)\s*seconds?/i,
    );
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/queens/*'],
  main() {
    let fired = false;
    let announced = false;
    console.log('[queens-cheat] content script loaded');
    autoFire(
      'queens-cheat',
      () => {
        if (fired) return true;
        const board = readBoard();
        if (!board) return false;
        // Wait until each row has at least one cell with a known color region.
        if (board.regions[0].every((v) => v === -1)) return false;
        // Fail fast rather than waiting out the clock on an unsolvable read.
        if (!solve(board)) {
          console.warn('[queens-cheat] no solution found');
          return true;
        }
        const target = minElapsedSeconds();
        const elapsed = readElapsedSeconds();
        if (!announced) {
          announced = true;
          console.log(`[queens-cheat] solution found; playing once the clock reaches ${target}s`);
        }
        if (elapsed == null || elapsed < target) return false;
        fired = true;
        void playNow(elapsed);
        return true;
      },
      // Long enough to outlast whatever minElapsedS is set to.
      { timeoutMs: (minElapsedSeconds() + 120) * 1000 },
    );
  },
});

/**
 * Re-read immediately before playing: while we wait on the clock React
 * re-renders the board, so element handles and cell states captured earlier go
 * stale.
 */
async function playNow(elapsed: number): Promise<void> {
  const board = readBoard();
  if (!board) {
    console.warn('[queens-cheat] board vanished before play');
    return;
  }
  const placement = solve(board);
  if (!placement) {
    console.warn('[queens-cheat] no solution found on re-read');
    return;
  }
  console.log(`[queens-cheat] playing at ${elapsed}s on the clock`);
  await play(board, placement);
}
