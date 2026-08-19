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
- Eraser: `E`; Line: `L`; Arrow: `A`; Rectangle: `R`; Ellipse: `O`; Diamond: `D`.
- Undo/redo: `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y`.
- Save locally: `Ctrl/Cmd+S`.
- Delete selection: `Delete` or `Backspace`.
- Zoom: Ctrl/Cmd + wheel, `+`/`-`, or the controls at bottom right. A regular wheel/trackpad gesture pans.

The File menu exports editable `.stillboard` project files as well as PNG and SVG. If objects are selected, PNG/SVG export contains the selection; otherwise it contains the entire board.

## Privacy model

All authored content is persisted through the browser's IndexedDB and explicit local file downloads. The app makes no runtime network requests and includes no remote fonts, remote images, analytics, or content APIs. Package downloads are needed only while installing/building the app.
