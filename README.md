# Collage Layout Planner

A lightweight browser app for planning collage photo layouts.

It supports multiple layout strategies, direct canvas editing, grid snapping, overlap detection, and PDF export.

## Tech stack

- Plain HTML, CSS, and JavaScript
- No build step
- `jsPDF` loaded from CDN for PDF export

## Run locally

1. Open `index.html` in a browser.
2. Optional: use a local static server if you prefer (for example, `python -m http.server`).

## Core workflow

1. Choose units (`in` or `cm`).
2. Enter `W / H / Qty` and click `+` to place photo boxes directly on the canvas.
3. Optionally choose layout style and art direction, then use `Generate Design` / `Shuffle` for auto-arrangement.
4. Refine on canvas using drag, resize handles, rotate (`R`), delete (`Delete` key or box `✕` button), marquee selection, and alignment/spacing tools.
6. Export as PDF.

## Features

- 11 layout styles: manual, centered block grid, masonry, anchor/satellite, T-shape, skyline, top-aligned rows, bottom-aligned rows, cloud, shelf bin pack, fill rectangle
- Art-direction presets: balanced, gallery, salon
- Grid controls: snap-to-grid, visible grid lines, adjustable grid size
- Selection tools: multi-select, box-select, center, auto-space
- On-canvas actions per box: rotate and delete controls
- Export panel collapsed by default in top controls
- Validation feedback: overlap and out-of-bounds warnings
- Undo support
- Local persistence via `localStorage` key `collage-planner`

## File overview

- `index.html`: app shell and controls
- `style.css`: layout, theme, canvas/photo styles
- `state.js`: global state, unit conversion, persistence, undo, add-to-canvas behavior
- `layout.js`: layout algorithms and strategy dispatcher
- `render.js`: canvas rendering, gap annotations, overlap checks, selection visuals
- `interact.js`: drag, resize, rotate, delete, keyboard shortcuts, marquee selection
- `export.js`: PDF generation and app bootstrapping
- `MAP.md`: architecture and function map

## Notes

- Current architecture uses shared globals across scripts loaded in order from `index.html`.
- If this grows further, a module-based structure (or framework migration) would reduce coupling.
