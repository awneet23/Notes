# Stillboard

Stillboard is a private, local-first infinite whiteboard. It stores boards in IndexedDB on the current device. There is no account, analytics, telemetry, or cloud synchronization. Its optional AI diagram generator uses a stateless Vercel Function only when the user explicitly submits a prompt.

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

The normal whiteboard works with `npm run dev`. To exercise the `/api/openai-diagram` Vercel Function locally, run the project with `vercel dev`.

## Controls

- Select: `V`; hold Shift while clicking or drag a marquee for multi-select.
- Pan: `H`, middle mouse, or hold Space.
- Pen: `P`; hold Shift when releasing a rough stroke to tidy it into a line, ellipse, rectangle, triangle, diamond, or star.
- Text area: `T`; drag to set a wrapping width or tap for a default-width box. Tap existing text with the Text tool, or double-click it, to continue editing.
- Eraser: `E`; drag across a pencil stroke to erase only the touched section. Other objects erase as a whole.
- Line: `L`; Arrow: `A`. Press `S` to open Shapes & Icons. Rectangle: `R`; Ellipse: `O`; Diamond: `D`.
- Connector arrows: select a shape, then drag one of its four green connection bubbles toward another shape. Attached arrows follow shape movement and resizing.
- Undo/redo: `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y`.
- Save locally: `Ctrl/Cmd+S`.
- Delete selection: `Delete` or `Backspace`.
- Zoom: Ctrl/Cmd + wheel, `+`/`-`, or the controls at bottom right. A regular wheel/trackpad gesture pans.
- Phone/tablet: one finger uses the selected tool; two fingers pan and pinch-zoom the board.

The File menu exports editable `.stillboard` project files as well as PNG and SVG. If objects are selected, PNG/SVG export contains the selection; otherwise it contains the entire board.

The compact Canvas menu controls each board's color and paper style. Available paper styles are Plain, Dots, Grid, Ruled, and Cross, and custom colors can be chosen with the color picker. These settings are stored locally and preserved in exports.

## Privacy model

All authored content is persisted through the browser's IndexedDB and explicit local file downloads. Nothing is synchronized between devices. The app includes no remote fonts, remote images, analytics, accounts, or cloud storage.

## Optional OpenAI integration

Open the **AI** panel, enter a personal OpenAI API key, and describe a diagram. Stillboard calls the OpenAI Responses API with strict structured output, then converts the result into native editable shapes, labels, and bound connectors.

- The API key is held only in React memory for the current tab. It is not written to IndexedDB, `localStorage`, board autosaves, service-worker caches, or exports.
- The same-origin Vercel Function forwards the key and prompt for that request and does not log or store them in application code.
- The request sets `store: false`. No existing board content is sent; only the prompt typed into the AI panel is included.
- OpenAI recommends keeping API keys out of browser applications. This BYOK mode is therefore opt-in and should be used with a restricted project key, a low spending limit, and rotation/revocation when appropriate.
- No Vercel environment variable is required because each user supplies their own key.

## Install and offline use

After the deployed site has loaded successfully once, its app shell is cached for offline use. On a phone, use the browser's **Add to Home Screen** or **Install app** action to launch Stillboard like an app. The service worker caches only same-origin application files; board content remains in that device's IndexedDB and is never placed in the app-shell cache.
