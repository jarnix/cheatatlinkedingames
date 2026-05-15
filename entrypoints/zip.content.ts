import { readGrid } from '../lib/zip/read-grid';
import { solve } from '../lib/zip/solve';
import { play } from '../lib/zip/play';
import { detectWalls, adjacencyWithWalls } from '../lib/zip/walls';
import { autoFire } from '../lib/auto-fire';

const TARGET_DURATION_MS = 1500;

export default defineContentScript({
  matches: ['https://www.linkedin.com/games/zip/*'],
  main() {
    let fired = false;
    console.log('[zip-cheat] content script loaded');
    autoFire('zip-cheat', () => {
      if (fired) return true;
      const read = readGrid();
      if (!read) return false;
      fired = true;
      void run(read);
      return true;
    });
  },
});

async function run(read: ReturnType<typeof readGrid> & object): Promise<void> {
  const { grid, cellRects } = read;
  try {
    const blocked = await detectWallsViaScreenshot(grid.rows, grid.cols, cellRects);
    if (blocked) {
      grid.adjacency = adjacencyWithWalls(grid.rows, grid.cols, blocked);
      console.log(
        `[zip-cheat] walls: ${blocked.blockedH.size} horizontal, ${blocked.blockedV.size} vertical`,
      );
    } else {
      console.warn('[zip-cheat] wall detection failed; assuming no walls');
    }
  } catch (e) {
    console.warn('[zip-cheat] wall detection error; assuming no walls', e);
  }

  const path = solve(grid);
  if (!path) {
    console.warn('[zip-cheat] no solution found');
    return;
  }
  await play(grid, path, TARGET_DURATION_MS);
}

async function detectWallsViaScreenshot(
  rows: number,
  cols: number,
  cellRects: { x: number; y: number; w: number; h: number }[],
) {
  const resp = (await browser.runtime.sendMessage({ type: 'capture-screenshot' })) as
    | { ok: boolean; data?: string; error?: string }
    | undefined;
  if (!resp?.ok || !resp.data) {
    console.warn('[zip-cheat] screenshot failed:', resp?.error);
    return null;
  }
  const img = new Image();
  img.src = `data:image/png;base64,${resp.data}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Page.captureScreenshot grabs the visible viewport at devicePixelRatio.
  const scale = img.naturalWidth / window.innerWidth;
  return detectWalls(imageData, scale, cellRects, rows, cols);
}
