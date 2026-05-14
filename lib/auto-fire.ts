/**
 * Repeatedly invoke `tryFire` until it returns `true` (success) or the
 * timeout expires. WXT's default content-script timing (`document_idle`)
 * runs after the DOM is loaded but React still mounts the puzzle grid
 * asynchronously, so a single check often races the mount. A MutationObserver
 * also misses cases where the grid is already there but the cell text
 * content/aria-labels haven't been populated yet.
 *
 * Polling at a fixed interval until the grid is ready is the most reliable
 * way to catch the mount regardless of the page's load timing.
 */
export function autoFire(
  label: string,
  tryFire: () => boolean,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): void {
  const interval = opts.intervalMs ?? 200;
  const timeout = opts.timeoutMs ?? 15000;
  const start = Date.now();
  if (tryFire()) return;
  const handle = window.setInterval(() => {
    if (tryFire()) {
      window.clearInterval(handle);
      return;
    }
    if (Date.now() - start > timeout) {
      window.clearInterval(handle);
      console.warn(`[${label}] auto-fire gave up after ${timeout}ms`);
    }
  }, interval);
}
