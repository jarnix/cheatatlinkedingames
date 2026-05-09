import type { CellIdx, Grid } from './grid';

export async function play(
  _grid: Grid,
  path: CellIdx[],
  durationMs = 1500,
): Promise<void> {
  const points: Array<{ x: number; y: number }> = [];
  for (const idx of path) {
    const el = document.querySelector<HTMLElement>(`[data-cell-idx="${idx}"]`);
    if (!el) {
      console.warn('[zip-cheat] missing cell', idx);
      return;
    }
    const r = el.getBoundingClientRect();
    points.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  const response = (await browser.runtime.sendMessage({
    type: 'zip-play',
    points,
    durationMs,
  })) as { ok: boolean; error?: string } | undefined;

  if (!response?.ok) {
    console.error('[zip-cheat] play failed:', response?.error ?? 'no response');
  }
}
