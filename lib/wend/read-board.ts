export type WendBoard = {
  rows: number;
  cols: number;
  /** Letter per cell index; '' for a blocked cell. */
  letters: string[];
  /** Required word lengths, in slot-row order. */
  lengths: number[];
  /** Words already committed, by slot row ('' when still empty). */
  solved: string[];
  cellElements: HTMLElement[];
};

const CONTAINER_SELECTOR = '[data-testid="interactive-grid"]';
const CELL_SELECTOR = '[data-cell-idx]';

export function readBoard(): WendBoard | null {
  const container = document.querySelector<HTMLElement>(CONTAINER_SELECTOR);
  if (!container) return null;

  const cellElements = Array.from(
    container.querySelectorAll<HTMLElement>(CELL_SELECTOR),
  ).sort((a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1));
  if (cellElements.length === 0) return null;

  // An unlaid-out board would give play() nonsense coordinates; wait instead.
  const first = cellElements[0].getBoundingClientRect();
  if (first.width === 0 || first.height === 0) return null;

  const cols = inferCols(container, cellElements);
  if (!cols || cellElements.length % cols !== 0) {
    console.warn('[wend-cheat] could not infer grid columns', { cols });
    return null;
  }
  const rows = cellElements.length / cols;

  const letters = cellElements.map((c) => (c.textContent ?? '').trim().toUpperCase());
  if (letters.every((l) => !l)) return null;

  const { lengths, solved } = readSlots();
  if (lengths.length === 0) return null;

  const playable = letters.filter(Boolean).length;
  const need = lengths.reduce((a, b) => a + b, 0);
  if (playable !== need) {
    console.warn('[wend-cheat] tiles do not match slots', { playable, need });
    return null;
  }

  console.log('[wend-cheat] board read', { rows, cols, lengths, playable });
  return { rows, cols, letters, lengths, solved, cellElements };
}

/**
 * Word lengths come from the answer slots under the board: one row per word,
 * `wend-word-list-slot-<row>-<n>` per letter. A row whose slots carry text is
 * a word already found.
 */
function readSlots(): { lengths: number[]; solved: string[] } {
  const lengths: number[] = [];
  const solved: string[] = [];
  for (let row = 0; ; row++) {
    const slots = document.querySelectorAll<HTMLElement>(
      `[data-testid^="wend-word-list-slot-${row}-"]`,
    );
    if (slots.length === 0) break;
    lengths.push(slots.length);
    solved.push(
      Array.from(slots).map((s) => (s.textContent ?? '').trim()).join('').toUpperCase(),
    );
  }
  return { lengths, solved };
}

/** Same ladder as the Zip reader: each source is unreliable in some state. */
function inferCols(container: HTMLElement, cells: HTMLElement[]): number | null {
  const total = cells.length;

  const tracks = getComputedStyle(container).gridTemplateColumns;
  if (tracks && tracks !== 'none' && !tracks.includes('(')) {
    const n = tracks.trim().split(/\s+/).length;
    if (n > 1 && total % n === 0) return n;
  }

  const top = cells[0].getBoundingClientRect().top;
  let byLayout = 0;
  for (const cell of cells) {
    if (Math.abs(cell.getBoundingClientRect().top - top) > 1) break;
    byLayout++;
  }
  if (byLayout > 0 && byLayout < total && total % byLayout === 0) return byLayout;

  const vars = [...(container.getAttribute('style') ?? '').matchAll(/--[\w-]+\s*:\s*(\d+)/g)]
    .map((m) => Number(m[1]));
  for (let i = vars.length - 1; i >= 0; i--) {
    if (vars[i] > 0 && total % vars[i] === 0) return vars[i];
  }
  return null;
}
