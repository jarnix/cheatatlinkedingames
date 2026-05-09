// Minimal CDP client. Usage:
//   node scripts/cdp.mjs eval '<js expression>'
//   node scripts/cdp.mjs listeners            (dump event listeners on grid + ancestors)
//   node scripts/cdp.mjs grid                 (read grid via the same logic the extension uses)
//   node scripts/cdp.mjs walls                (dump computed border styles for every cell)
//   node scripts/cdp.mjs play [durationMs]    (solve and drag via trusted touch events; default 1500ms)
//   node scripts/cdp.mjs patches              (solve patches, paint via touch drags — same algorithm as the extension)
//
// Connects to the first tab matching linkedin.com/games/zip on http://localhost:9222.

const TARGET_URL_MATCH = /linkedin\.com\/games\//;
const CDP_HOST = 'http://localhost:9222';

const targets = await fetch(`${CDP_HOST}/json/list`).then((r) => r.json());
const target = targets.find((t) => t.type === 'page' && TARGET_URL_MATCH.test(t.url));
if (!target) {
  console.error('No Zip puzzle tab found at', CDP_HOST);
  console.error('Open https://www.linkedin.com/games/zip/ in the debug-port Chrome and retry.');
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(`${m.error.code}: ${m.error.message}`));
    else resolve(m.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
await send('DOM.enable');

const cmd = process.argv[2] ?? 'eval';
const arg = process.argv.slice(3).join(' ');

async function evalInPage(expression, returnByValue = true) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue,
    awaitPromise: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result;
}

if (cmd === 'eval') {
  const r = await evalInPage(arg, true);
  console.log(JSON.stringify(r.value, null, 2));
} else if (cmd === 'listeners') {
  // Get a starting element and walk up its ancestors, reporting every
  // (event type, useCapture) listener on each. Selector is an optional
  // CSS arg; defaults to the Zip grid.
  const startSelector = arg || '[data-testid="interactive-grid"]';
  const setup = `
    (() => {
      const start = document.querySelector(${JSON.stringify(startSelector)});
      if (!start) return null;
      const chain = [];
      let n = start;
      while (n && chain.length < 10) {
        chain.push(n);
        n = n.parentElement;
      }
      window.__cdpChain = chain;
      return chain.map(el => ({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid') || null,
        klass: (el.getAttribute('class') || '').slice(0, 60),
      }));
    })()
  `;
  const meta = (await evalInPage(setup, true)).value;
  if (!meta) {
    console.error('Grid not found in page DOM.');
    process.exit(2);
  }
  console.log('Ancestor chain (closest first):');
  for (let i = 0; i < meta.length; i++) {
    const m = meta[i];
    const handle = await evalInPage(`window.__cdpChain[${i}]`, false);
    const { listeners } = await send('DOMDebugger.getEventListeners', {
      objectId: handle.objectId,
      depth: 0,
    });
    const summary = listeners.map((l) => `${l.type}${l.useCapture ? '(cap)' : ''}${l.passive ? '(pass)' : ''}`);
    console.log(
      `  [${i}] <${m.tag}${m.testid ? ` data-testid="${m.testid}"` : ''}>`,
      summary.length ? summary.join(', ') : '(no listeners)',
    );
  }
} else if (cmd === 'grid') {
  const probe = `
    (() => {
      const c = document.querySelector('[data-testid="interactive-grid"]');
      if (!c) return null;
      const cells = [...c.querySelectorAll('[data-cell-idx]')]
        .sort((a,b) => Number(a.dataset.cellIdx) - Number(b.dataset.cellIdx));
      const colsFromVar = (() => {
        const m = (c.getAttribute('style') || '').match(/--[\\w-]+\\s*:\\s*(\\d+)/);
        return m ? Number(m[1]) : null;
      })();
      const waypoints = [];
      cells.forEach((el, idx) => {
        const lab = el.getAttribute('aria-label');
        if (!lab) return;
        const m = lab.match(/\\d+/);
        if (m) waypoints[Number(m[0]) - 1] = idx;
      });
      return {
        total: cells.length,
        colsFromStyleVar: colsFromVar,
        waypoints,
        firstCellHTML: cells[0]?.outerHTML.slice(0, 600),
        gridStyle: c.getAttribute('style'),
      };
    })()
  `;
  const r = (await evalInPage(probe, true)).value;
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'walls') {
  // Dump per-cell computed border colors. If walls are encoded as
  // border-color flips, we can spot them by which side has alpha > 0.
  const probe = `
    (() => {
      const cells = [...document.querySelectorAll('[data-cell-idx]')]
        .sort((a,b) => Number(a.dataset.cellIdx) - Number(b.dataset.cellIdx));
      return cells.map((el, i) => {
        const cs = getComputedStyle(el);
        return {
          i,
          aria: el.getAttribute('aria-label'),
          borderTop: cs.borderTopColor + ' ' + cs.borderTopWidth,
          borderRight: cs.borderRightColor + ' ' + cs.borderRightWidth,
          borderBottom: cs.borderBottomColor + ' ' + cs.borderBottomWidth,
          borderLeft: cs.borderLeftColor + ' ' + cs.borderLeftWidth,
        };
      });
    })()
  `;
  const r = (await evalInPage(probe, true)).value;
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'play') {
  const durationMs = Number(arg) || 1500;
  // Read grid + solve in-page (Hamiltonian path with ordered waypoints), and
  // for the resulting cell-idx sequence, return viewport coords of each cell
  // center. We then drive trusted touch events through CDP.
  const probe = `
    (() => {
      const c = document.querySelector('[data-testid="interactive-grid"]');
      if (!c) return { error: 'no grid' };
      const cells = [...c.querySelectorAll('[data-cell-idx]')]
        .sort((a, b) => Number(a.dataset.cellIdx) - Number(b.dataset.cellIdx));
      const total = cells.length;
      const styleVar = (c.getAttribute('style') || '').match(/--[\\w-]+\\s*:\\s*(\\d+)/);
      const cols = styleVar ? Number(styleVar[1]) : Math.round(Math.sqrt(total));
      if (total % cols !== 0) return { error: 'cols/total mismatch', total, cols };
      const rows = total / cols;
      const waypoints = [];
      cells.forEach((el, idx) => {
        const lab = el.getAttribute('aria-label');
        if (!lab) return;
        const m = lab.match(/\\d+/);
        if (m) waypoints[Number(m[0]) - 1] = idx;
      });
      if (!waypoints.length || waypoints.some(v => v === undefined)) {
        return { error: 'bad waypoints', waypoints };
      }
      // Hamiltonian path with ordered waypoints (DFS).
      const wpAt = new Int32Array(total).fill(-1);
      waypoints.forEach((idx, i) => { wpAt[idx] = i; });
      const visited = new Uint8Array(total);
      const path = new Array(total);
      const target = waypoints.length;
      const adj = (i) => {
        const r = (i / cols) | 0, co = i % cols;
        const out = [];
        if (r > 0) out.push(i - cols);
        if (r < rows - 1) out.push(i + cols);
        if (co > 0) out.push(i - 1);
        if (co < cols - 1) out.push(i + 1);
        return out;
      };
      function dfs(cur, depth, nextWp) {
        const wp = wpAt[cur];
        let nw = nextWp;
        if (wp !== -1) {
          if (wp !== nextWp) return false;
          nw = nextWp + 1;
        }
        visited[cur] = 1;
        path[depth] = cur;
        if (depth + 1 === total) {
          if (nw === target) return true;
          visited[cur] = 0;
          return false;
        }
        for (const n of adj(cur)) {
          if (!visited[n] && dfs(n, depth + 1, nw)) return true;
        }
        visited[cur] = 0;
        return false;
      }
      if (!dfs(waypoints[0], 0, 0)) return { error: 'no solution' };
      const dpr = window.devicePixelRatio || 1;
      const points = path.map((idx) => {
        const r = cells[idx].getBoundingClientRect();
        return { idx, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      // Bring the grid into view if it's not visible.
      c.scrollIntoView({ block: 'center', inline: 'center' });
      return { rows, cols, total, waypoints, path, points, dpr };
    })()
  `;
  const r = (await evalInPage(probe, true)).value;
  if (r.error) {
    console.error('probe error:', r);
    process.exit(3);
  }
  console.log(`solved: ${r.path.length} cells, ${r.waypoints.length} waypoints; dragging in ${durationMs}ms`);

  // Re-read points after scroll, in case scrollIntoView shifted the layout.
  const refresh = `
    (() => {
      const cells = [...document.querySelectorAll('[data-cell-idx]')]
        .sort((a, b) => Number(a.dataset.cellIdx) - Number(b.dataset.cellIdx));
      return ${JSON.stringify(r.path)}.map(idx => {
        const rc = cells[idx].getBoundingClientRect();
        return { idx, x: rc.left + rc.width/2, y: rc.top + rc.height/2 };
      });
    })()
  `;
  const points = (await evalInPage(refresh, true)).value;

  const stepMs = durationMs / Math.max(points.length - 1, 1);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Desktop Chrome ignores Input.dispatchTouchEvent unless touch is enabled
  // first. Emulation.setTouchEmulationEnabled flips the renderer to accept
  // synthetic touch input.
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  try {
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: points[0].x, y: points[0].y, id: 1 }],
    });
    for (let i = 1; i < points.length; i++) {
      await sleep(stepMs);
      await send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: points[i].x, y: points[i].y, id: 1 }],
      });
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  console.log('done');
} else if (cmd === 'patches') {
  // Read board, solve, and dispatch the same multi-drag plan as the extension.
  const probe = `
    (() => {
      const grid = document.querySelector('[data-testid="interactive-grid"]');
      if (!grid) return { error: 'no grid' };
      const cells = [...grid.querySelectorAll('[data-cell-idx]')]
        .sort((a, b) => +a.dataset.cellIdx - +b.dataset.cellIdx);
      const total = cells.length;
      const styleVar = (grid.getAttribute('style') || '').match(/--[\\w-]+\\s*:\\s*(\\d+)/);
      const cols = styleVar ? Number(styleVar[1]) : Math.round(Math.sqrt(total));
      const rows = total / cols;
      const clues = [];
      for (let i = 0; i < cells.length; i++) {
        const aria = cells[i].getAttribute('aria-label') || '';
        let kind = null;
        if (/wide rectangle clue/i.test(aria)) kind = 'wide';
        else if (/tall rectangle clue/i.test(aria)) kind = 'tall';
        else if (/square clue/i.test(aria)) kind = 'square';
        if (!kind) continue;
        const sm = aria.match(/(\\d+)\\s+cells?/i);
        clues.push({ cellIdx: i, row: Math.floor(i / cols), col: i % cols, kind, size: sm ? +sm[1] : null });
      }
      const cellRects = cells.map(c => {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      return { rows, cols, total, clues, cellRects };
    })()
  `;
  const data = (await evalInPage(probe, true)).value;
  if (data.error) {
    console.error('probe error:', data);
    process.exit(3);
  }
  const { rows, cols, clues, cellRects } = data;
  console.log(`board ${rows}x${cols}, ${clues.length} clues`);

  // === Solver (identical to lib/patches/solve.ts) ===
  const enumerateSizes = (kind, size) => {
    const out = [];
    if (kind === 'square') {
      if (size != null) {
        const s = Math.round(Math.sqrt(size));
        if (s * s === size && s <= Math.min(rows, cols)) out.push({ w: s, h: s });
      } else for (let s = 1; s <= Math.min(rows, cols); s++) out.push({ w: s, h: s });
    } else if (kind === 'wide') {
      for (let w = 2; w <= cols; w++) for (let h = 1; h < w && h <= rows; h++) {
        if (size != null && w * h !== size) continue;
        out.push({ w, h });
      }
    } else {
      for (let h = 2; h <= rows; h++) for (let w = 1; w < h && w <= cols; w++) {
        if (size != null && w * h !== size) continue;
        out.push({ w, h });
      }
    }
    return out;
  };
  const enumeratePlacements = (clue) => {
    const out = [];
    for (const { w, h } of enumerateSizes(clue.kind, clue.size)) {
      const minR = Math.max(0, clue.row - (h - 1));
      const maxR = Math.min(rows - h, clue.row);
      const minC = Math.max(0, clue.col - (w - 1));
      const maxC = Math.min(cols - w, clue.col);
      for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++)
        out.push({ clue, row: r, col: c, w, h });
    }
    out.sort((a, b) => b.w * b.h - a.w * a.h);
    return out;
  };
  const candidates = clues.map(enumeratePlacements);
  const occupied = new Int32Array(rows * cols).fill(-1);
  const chosen = clues.map(() => null);
  const order = clues.map((_, i) => i).sort((a, b) => candidates[a].length - candidates[b].length);
  const fits = (p) => {
    for (let dr = 0; dr < p.h; dr++) for (let dc = 0; dc < p.w; dc++)
      if (occupied[(p.row + dr) * cols + (p.col + dc)] !== -1) return false;
    return true;
  };
  const mark = (p, v) => {
    for (let dr = 0; dr < p.h; dr++) for (let dc = 0; dc < p.w; dc++)
      occupied[(p.row + dr) * cols + (p.col + dc)] = v;
  };
  const tryClue = (oi, area) => {
    if (oi === clues.length) return area === rows * cols;
    const ci = order[oi];
    for (const p of candidates[ci]) {
      if (!fits(p)) continue;
      mark(p, ci); chosen[ci] = p;
      if (tryClue(oi + 1, area + p.w * p.h)) return true;
      mark(p, -1); chosen[ci] = null;
    }
    return false;
  };
  if (!tryClue(0, 0)) { console.error('no solution'); process.exit(4); }
  console.log('solved');

  // === Single Hamiltonian-path drag per shape, starting at the clue ===
  // For a 2D rectangle (both dims >= 2), a Hamiltonian path from any cell
  // exists; we find it with backtracking. For a 1×N rectangle, a Hamiltonian
  // path from the clue exists only if the clue is at an endpoint; if the
  // clue is interior, we emit two drags (one each direction from clue).
  const cellAt = (r, c) => cellRects[r * cols + c];
  const drags = [];
  for (const p of chosen) {
    const cr = p.clue.row, cc = p.clue.col;
    const r0 = p.row, c0 = p.col, w = p.w, h = p.h;
    const N = w * h;
    const inRect = (r, c) => r >= r0 && r < r0 + h && c >= c0 && c < c0 + w;
    // 1D special case: only one row or column.
    if (w === 1 || h === 1) {
      if (w === 1) {
        // tall 1×h. clue must be along this column.
        const top = r0, bot = r0 + h - 1;
        if (cr === top) drags.push(rangePoints((r) => cellAt(r, c0), top, bot));
        else if (cr === bot) drags.push(rangePoints((r) => cellAt(r, c0), bot, top));
        else {
          drags.push(rangePoints((r) => cellAt(r, c0), cr, top));
          drags.push(rangePoints((r) => cellAt(r, c0), cr, bot));
        }
      } else {
        const left = c0, right = c0 + w - 1;
        if (cc === left) drags.push(rangePoints((c) => cellAt(r0, c), left, right));
        else if (cc === right) drags.push(rangePoints((c) => cellAt(r0, c), right, left));
        else {
          drags.push(rangePoints((c) => cellAt(r0, c), cc, left));
          drags.push(rangePoints((c) => cellAt(r0, c), cc, right));
        }
      }
      continue;
    }
    // 2D: row-by-row snake from the clue. Every 2D clue in this game so far
    // sits at a corner of its rectangle, so snake from that corner.
    const r1 = r0 + h - 1, c1 = c0 + w - 1;
    const path = [];
    if (cr === r0 && cc === c0)        snake(path, r0, r1, c0, c1, 1, 1, 'horizontal-first');
    else if (cr === r0 && cc === c1)   snake(path, r0, r1, c1, c0, 1, -1, 'horizontal-first');
    else if (cr === r1 && cc === c0)   snake(path, r1, r0, c0, c1, -1, 1, 'horizontal-first');
    else if (cr === r1 && cc === c1)   snake(path, r1, r0, c1, c0, -1, -1, 'horizontal-first');
    else {
      console.error(`2D clue not at corner: shape (${r0},${c0}) ${w}x${h} clue (${cr},${cc})`);
      process.exit(5);
    }
    if (path.length !== N) {
      console.error(`snake length mismatch: ${path.length} vs ${N}`);
      process.exit(5);
    }
    drags.push(path.map(([r, c]) => cellAt(r, c)));
  }
  console.log(`dispatching ${drags.length} drags`);

  function snake(out, rStart, rEnd, cStart, cEnd, rStep, cStep) {
    let curC = cStart, curCEnd = cEnd, curCStep = cStep;
    for (let r = rStart; r !== rEnd + rStep; r += rStep) {
      for (let c = curC; c !== curCEnd + curCStep; c += curCStep) {
        out.push([r, c]);
      }
      [curC, curCEnd] = [curCEnd, curC];
      curCStep = -curCStep;
    }
  }

  function rangePoints(at, a, b) {
    const out = [];
    const step = a <= b ? 1 : -1;
    for (let i = a; i !== b + step; i += step) out.push(at(i));
    return out;
  }

  // === Dispatch ===
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let touchId = 1;
  const STEPS = 6; // intermediate touchmoves between cells (proven by isolated test)
  try {
    for (let i = 0; i < drags.length; i++) {
      const points = drags[i];
      if (points.length === 0) continue;
      const id = touchId++;
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: points[0].x, y: points[0].y, id }],
      });
      await sleep(80);
      let lastX = points[0].x, lastY = points[0].y;
      for (let p = 1; p < points.length; p++) {
        const from = points[p - 1], to = points[p];
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          lastX = from.x + (to.x - from.x) * t;
          lastY = from.y + (to.y - from.y) * t;
          await send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: lastX, y: lastY, id }],
          });
          await sleep(15);
        }
      }
      await sleep(50);
      await send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: lastX, y: lastY, id }],
      });
      await sleep(150);
    }
  } finally {
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  console.log('done');
} else {
  console.error('Unknown command:', cmd);
  process.exit(2);
}

ws.close();
