type Point = { x: number; y: number };

type ZipPlayMessage = {
  type: 'zip-play';
  points: Point[];
  durationMs: number;
};

type SudokuFillMessage = {
  type: 'sudoku-fill';
  clicks: Array<{ cellPoint: Point; digitPoint: Point }>;
  gapMs: number;
};

type PatchesPaintMessage = {
  type: 'patches-paint';
  drags: Point[][];
};

type TangoFillMessage = {
  type: 'tango-fill';
  clicks: Array<{ x: number; y: number; button: 'left' | 'right' }>;
  gapMs: number;
};

type IncomingMessage =
  | ZipPlayMessage
  | SudokuFillMessage
  | PatchesPaintMessage
  | TangoFillMessage;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'no tabId on sender' });
      return;
    }
    let kind: string | null = null;
    let work: Promise<void> | null = null;
    if (isZipPlay(msg)) { kind = 'zip-play'; work = zipPlay(tabId, msg); }
    else if (isSudokuFill(msg)) { kind = 'sudoku-fill'; work = sudokuFill(tabId, msg); }
    else if (isPatchesPaint(msg)) { kind = 'patches-paint'; work = patchesPaint(tabId, msg); }
    else if (isTangoFill(msg)) { kind = 'tango-fill'; work = tangoFill(tabId, msg); }
    if (!work) return;

    console.log(`[bg] ${kind} on tab ${tabId} — starting`);
    work
      .then(() => {
        console.log(`[bg] ${kind} on tab ${tabId} — done`);
        sendResponse({ ok: true });
      })
      .catch((err: unknown) => {
        console.error(`[bg] ${kind} on tab ${tabId} — error:`, err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  });
});

async function attachDebugger(tabId: number, label: string): Promise<{ tabId: number }> {
  if (!browser.debugger) throw new Error('browser.debugger API not available');
  const target = { tabId };
  console.log(`[bg] ${label}: attaching debugger to tab ${tabId}`);
  try {
    await browser.debugger.attach(target, '1.3');
    console.log(`[bg] ${label}: debugger attached`);
  } catch (e) {
    console.error(`[bg] ${label}: debugger.attach failed`, e);
    throw e;
  }
  return target;
}

async function detachDebugger(target: { tabId: number }, label: string): Promise<void> {
  try {
    await browser.debugger.detach(target);
    console.log(`[bg] ${label}: debugger detached`);
  } catch (e) {
    console.warn(`[bg] ${label}: debugger.detach failed`, e);
  }
}

async function zipPlay(tabId: number, msg: ZipPlayMessage): Promise<void> {
  const target = await attachDebugger(tabId, 'zip-play');
  try {
    await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    const stepMs = msg.durationMs / Math.max(msg.points.length - 1, 1);
    await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: msg.points[0].x, y: msg.points[0].y, id: 1 }],
    });
    for (let i = 1; i < msg.points.length; i++) {
      await sleep(stepMs);
      await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: msg.points[i].x, y: msg.points[i].y, id: 1 }],
      });
    }
    await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    try {
      await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
        enabled: false,
      });
    } catch {}
    await detachDebugger(target, 'zip-play');
  }
}

async function sudokuFill(tabId: number, msg: SudokuFillMessage): Promise<void> {
  const target = await attachDebugger(tabId, 'sudoku-fill');
  try {
    for (const { cellPoint, digitPoint } of msg.clicks) {
      await click(target, cellPoint);
      await sleep(msg.gapMs);
      await click(target, digitPoint);
      await sleep(msg.gapMs);
    }
  } finally {
    await detachDebugger(target, 'sudoku-fill');
  }
}

async function patchesPaint(tabId: number, msg: PatchesPaintMessage): Promise<void> {
  const target = await attachDebugger(tabId, 'patches-paint');
  try {
    await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    // Each drag is a Hamiltonian path through one shape, starting at its clue
    // cell. The settings below were tuned empirically — flat cell-to-cell hops
    // miss intermediate cells, so we interpolate. touchEnd must include the
    // lifted point or the next touchStart looks like a multi-touch.
    const STEPS = 6;
    const SUB_MS = 15;
    const POST_TOUCHSTART_MS = 80;
    const PRE_TOUCHEND_MS = 50;
    // Long gap between drags so the game finishes processing each gesture
    // (and the resulting React re-render) before the next touchStart.
    // Freeform regions can produce 10+ small BFS drags; without this gap the
    // game appears to drop most of them.
    const BETWEEN_DRAGS_MS = 400;
    let touchId = 1;
    for (let d = 0; d < msg.drags.length; d++) {
      const points = msg.drags[d];
      if (points.length === 0) continue;
      const id = touchId++;
      await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: points[0].x, y: points[0].y, id }],
      });
      await sleep(POST_TOUCHSTART_MS);
      let lastX = points[0].x, lastY = points[0].y;
      for (let p = 1; p < points.length; p++) {
        const from = points[p - 1], to = points[p];
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          lastX = from.x + (to.x - from.x) * t;
          lastY = from.y + (to.y - from.y) * t;
          await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: lastX, y: lastY, id }],
          });
          await sleep(SUB_MS);
        }
      }
      await sleep(PRE_TOUCHEND_MS);
      await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: lastX, y: lastY, id }],
      });
      if (d < msg.drags.length - 1) await sleep(BETWEEN_DRAGS_MS);
    }
  } finally {
    try {
      await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
        enabled: false,
      });
    } catch {}
    await detachDebugger(target, 'patches-paint');
  }
}

async function tangoFill(tabId: number, msg: TangoFillMessage): Promise<void> {
  const target = await attachDebugger(tabId, 'tango-fill');
  try {
    for (const c of msg.clicks) {
      await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: c.x, y: c.y, button: c.button, clickCount: 1,
      });
      await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: c.x, y: c.y, button: c.button, clickCount: 1,
      });
      await sleep(msg.gapMs);
    }
  } finally {
    await detachDebugger(target, 'tango-fill');
  }
}

async function click(target: { tabId: number }, p: Point): Promise<void> {
  await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: p.x,
    y: p.y,
    button: 'left',
    clickCount: 1,
  });
  await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: p.x,
    y: p.y,
    button: 'left',
    clickCount: 1,
  });
}

function isZipPlay(v: unknown): v is ZipPlayMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { type?: unknown }).type === 'zip-play' &&
    Array.isArray((v as { points?: unknown }).points) &&
    typeof (v as { durationMs?: unknown }).durationMs === 'number'
  );
}

function isSudokuFill(v: unknown): v is SudokuFillMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { type?: unknown }).type === 'sudoku-fill' &&
    Array.isArray((v as { clicks?: unknown }).clicks) &&
    typeof (v as { gapMs?: unknown }).gapMs === 'number'
  );
}

function isPatchesPaint(v: unknown): v is PatchesPaintMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { type?: unknown }).type === 'patches-paint' &&
    Array.isArray((v as { drags?: unknown }).drags)
  );
}

function isTangoFill(v: unknown): v is TangoFillMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { type?: unknown }).type === 'tango-fill' &&
    Array.isArray((v as { clicks?: unknown }).clicks) &&
    typeof (v as { gapMs?: unknown }).gapMs === 'number'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
