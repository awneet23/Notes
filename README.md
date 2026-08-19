# Stillboard

Stillboard is a private, local-first infinite whiteboard. It runs entirely in the browser and stores boards in IndexedDB on the current device. There is no backend, account, analytics, telemetry, or cloud synchronization.

## Run locally

```bash
npm install
npm run dev
```

For a production bundle:

```bash
npm run build
npm run preview
```

Run the local interaction, geometry, export, and IndexedDB regression suite with:

```bash
npm test -- --maxWorkers=1
```

## Controls

- Select: `V`; hold Shift while clicking or drag a marquee for multi-select.
- Pan: `H`, middle mouse, or hold Space.
- Pen: `P`; hold Shift when releasing a rough stroke to tidy it into a line, ellipse, or rectangle.
- Text: `T`; double-click existing text to edit it.
- Eraser: `E`; Line: `L`; Arrow: `A`. Open the compact Shapes & Icons library for diagram shapes and reusable symbol stamps. Rectangle: `R`; Ellipse: `O`; Diamond: `D`.
- Undo/redo: `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y`.
- Save locally: `Ctrl/Cmd+S`.
- Delete selection: `Delete` or `Backspace`.
- Zoom: Ctrl/Cmd + wheel, `+`/`-`, or the controls at bottom right. A regular wheel/trackpad gesture pans.
- Phone/tablet: one finger uses the selected tool; two fingers pan and pinch-zoom the board.

The File menu exports editable `.stillboard` project files as well as PNG and SVG. If objects are selected, PNG/SVG export contains the selection; otherwise it contains the entire board.

The compact Canvas menu controls each board's color and paper style. Available paper styles are Plain, Dots, Grid, Ruled, and Cross, and custom colors can be chosen with the color picker. These settings are stored locally and preserved in exports.

## Privacy model

All authored content is persisted through the browser's IndexedDB and explicit local file downloads. Nothing is synchronized between devices. The app includes no remote fonts, remote images, analytics, content APIs, accounts, or cloud storage.

## Install and offline use

After the deployed site has loaded successfully once, its app shell is cached for offline use. On a phone, use the browser's **Add to Home Screen** or **Install app** action to launch Stillboard like an app. The service worker caches only same-origin application files; board content remains in that device's IndexedDB and is never placed in the app-shell cache.
