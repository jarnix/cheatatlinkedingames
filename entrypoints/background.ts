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
  drags: Array<{ points: Point[]; durationMs: number }>;
  gapBetweenDragsMs: number;
};

type IncomingMessage = ZipPlayMessage | SudokuFillMessage | PatchesPaintMessage;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'no tabId on sender' });
      return;
    }
    let work: Promise<void> | null = null;
    if (isZipPlay(msg)) work = zipPlay(tabId, msg);
    else if (isSudokuFill(msg)) work = sudokuFill(tabId, msg);
    else if (isPatchesPaint(msg)) work = patchesPaint(tabId, msg);
    if (!work) return;

    work
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });
});

async function zipPlay(tabId: number, msg: ZipPlayMessage): Promise<void> {
  if (!browser.debugger) throw new Error('browser.debugger API not available');
  const target = { tabId };
  await browser.debugger.attach(target, '1.3');
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
    try {
      await browser.debugger.detach(target);
    } catch {}
  }
}

async function sudokuFill(tabId: number, msg: SudokuFillMessage): Promise<void> {
  if (!browser.debugger) throw new Error('browser.debugger API not available');
  const target = { tabId };
  await browser.debugger.attach(target, '1.3');
  try {
    for (const { cellPoint, digitPoint } of msg.clicks) {
      await click(target, cellPoint);
      await sleep(msg.gapMs);
      await click(target, digitPoint);
      await sleep(msg.gapMs);
    }
  } finally {
    try {
      await browser.debugger.detach(target);
    } catch {}
  }
}

async function patchesPaint(tabId: number, msg: PatchesPaintMessage): Promise<void> {
  if (!browser.debugger) throw new Error('browser.debugger API not available');
  const target = { tabId };
  await browser.debugger.attach(target, '1.3');
  try {
    await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    for (let d = 0; d < msg.drags.length; d++) {
      const drag = msg.drags[d];
      if (drag.points.length === 0) continue;
      const stepMs = drag.durationMs / Math.max(drag.points.length - 1, 1);
      await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: drag.points[0].x, y: drag.points[0].y, id: 1 }],
      });
      for (let i = 1; i < drag.points.length; i++) {
        await sleep(stepMs);
        await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: drag.points[i].x, y: drag.points[i].y, id: 1 }],
        });
      }
      await browser.debugger.sendCommand(target, 'Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      if (d < msg.drags.length - 1) await sleep(msg.gapBetweenDragsMs);
    }
  } finally {
    try {
      await browser.debugger.sendCommand(target, 'Emulation.setTouchEmulationEnabled', {
        enabled: false,
      });
    } catch {}
    try {
      await browser.debugger.detach(target);
    } catch {}
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
    Array.isArray((v as { drags?: unknown }).drags) &&
    typeof (v as { gapBetweenDragsMs?: unknown }).gapBetweenDragsMs === 'number'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
