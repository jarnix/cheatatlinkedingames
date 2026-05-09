# cheatatlinkedingames

A Chrome extension that auto-solves LinkedIn's daily puzzle games. Built with [WXT](https://wxt.dev/).

## Supported games

| Game | URL | Status |
|------|-----|--------|
| Zip | `linkedin.com/games/zip/` | working |
| Mini Sudoku | `linkedin.com/games/mini-sudoku/` | working |
| Patches | `linkedin.com/games/patches/` | solver works; auto-play disabled (multi-drag execution unreliable) |

## How it works

Each game has its own content script that auto-fires when the puzzle DOM mounts:

1. The content script reads the board state from the DOM and runs a solver in pure JS.
2. It computes viewport coordinates for the moves it needs to make and sends them to the background service worker.
3. The service worker attaches the [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger) API to the active tab and dispatches **trusted** input via the Chrome DevTools Protocol — `Input.dispatchTouchEvent` for Zip's single drag and Patches' multi-drag region painting, `Input.dispatchMouseEvent` for Sudoku's click-pairs.
4. The SW detaches as soon as the play completes, so the "this extension is debugging your browser" bar only flashes briefly.

The CDP route is necessary because LinkedIn's games gate gameplay behind `isTrusted: true` events — `dispatchEvent` from page JS produces untrusted events that the games ignore.

## Project layout

```
entrypoints/
  background.ts            service worker (debugger attach + dispatch)
  zip.content.ts           Zip auto-fire content script
  mini-sudoku.content.ts   Mini Sudoku auto-fire content script
  patches.content.ts       Patches auto-fire content script
lib/
  zip/                     Zip: Hamiltonian path with ordered waypoints
  sudoku/                  Mini Sudoku: backtracking, 6×6 with 2×3 boxes
  patches/                 Patches: rectangular tiling solver and drag plan
scripts/
  cdp.mjs                  standalone CDP client used while reverse-engineering
                           new games. Commands: eval, listeners, grid, walls, play
```

## Build

```sh
npm install
npm run build
```

Output goes to `.output/chrome-mv3/`. Firefox isn't supported because every game's play step uses `chrome.debugger`, which Firefox doesn't expose to extensions.

## Install (Chrome)

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `.output/chrome-mv3/`
4. Open a supported game URL — the extension auto-fires.

DevTools must be closed on the puzzle tab while playing, since `chrome.debugger.attach` fails if another debugger is already attached.

## Adding a new game

The reverse-engineering workflow is in `scripts/cdp.mjs`. Launch a debug-port Chrome:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-cdp"
```

Log into LinkedIn, navigate to the game, then probe:

```sh
node scripts/cdp.mjs eval '<js expression>'         # arbitrary JS
node scripts/cdp.mjs listeners '<css selector>'     # event listeners on element + ancestors
```

Identify the gameplay-bearing DOM node and event family, then add: a content script entrypoint, a `lib/<game>/` solver, and a new message handler in `background.ts`. The architecture is established — most new games just need the solver and the input plan.
