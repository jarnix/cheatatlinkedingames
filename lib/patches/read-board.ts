export type ShapeKind = 'square' | 'wide' | 'tall' | 'freeform';

export type Clue = {
  /** Cell index in row-major order. */
  cellIdx: number;
  row: number;
  col: number;
  kind: ShapeKind;
  /** Required size in cells, or null if the clue carries no number. */
  size: number | null;
  /** Hex color from the cell's inline CSS variable (e.g. "#00AFFF"). */
  color: string;
};

export type PatchesBoard = {
  rows: number;
  cols: number;
  clues: Clue[];
  cellElements: HTMLElement[];
};

export function readBoard(): PatchesBoard | null {
  const grid = document.querySelector<HTMLElement>('[data-testid="interactive-grid"]');
  if (!grid) return null;

  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-cell-idx]')).sort(
    (a, b) => Number(a.dataset.cellIdx ?? -1) - Number(b.dataset.cellIdx ?? -1),
  );
  if (cells.length === 0) return null;

  const cols = inferColsFromStyleVar(grid) ?? Math.round(Math.sqrt(cells.length));
  if (!cols || cells.length % cols !== 0) return null;
  const rows = cells.length / cols;

  const clues: Clue[] = [];
  for (let i = 0; i < cells.length; i++) {
    const aria = cells[i].getAttribute('aria-label') ?? '';
    const kind = parseKind(aria);
    if (!kind) continue;
    const sizeMatch = aria.match(/(\d+)\s+cells?/i);
    const color = parseColor(cells[i].getAttribute('style') ?? '');
    clues.push({
      cellIdx: i,
      row: Math.floor(i / cols),
      col: i % cols,
      kind,
      size: sizeMatch ? Number(sizeMatch[1]) : null,
      color: color ?? '',
    });
  }

  return { rows, cols, clues, cellElements: cells };
}

function inferColsFromStyleVar(container: HTMLElement): number | null {
  const m = (container.getAttribute('style') ?? '').match(/--[\w-]+\s*:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseKind(aria: string): ShapeKind | null {
  if (/freeform clue/i.test(aria)) return 'freeform';
  if (/wide rectangle clue/i.test(aria)) return 'wide';
  if (/tall rectangle clue/i.test(aria)) return 'tall';
  if (/square clue/i.test(aria)) return 'square';
  return null;
}

function parseColor(style: string): string | null {
  const m = style.match(/--[\w-]+\s*:\s*#?([0-9a-fA-F]{6})/);
  return m ? `#${m[1].toUpperCase()}` : null;
}
