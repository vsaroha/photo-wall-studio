# Agent Notes

## Project scope

- Single-page collage planner built with plain `index.html` + global JS files.
- No build step, no framework, no package manager required.
- Open `index.html` directly in browser to run.

## Script load order (do not reorder casually)

1. `state.js`
2. `layout.js`
3. `render.js`
4. `interact.js`
5. `export.js`

Later files depend on globals declared earlier.

## Current UX conventions

- Photo size panel is input-only; no visible entry list.
- `+` adds photo boxes directly to canvas using `W / H / Qty`.
- Per-box controls on canvas: rotate (`↻`) and delete (`✕`).
- Top control area contains generation, arrange, export, and status controls.
- Export settings are collapsible and collapsed by default.

## State and persistence

- Main runtime arrays: `photoEntries`, `placedPhotos`.
- Persisted in `localStorage` key `collage-planner`.
- Keep `photoEntries` and `placedPhotos` in sync when deleting boxes (see `interact.js` removal helpers).

## Validation checklist before commit

- Run syntax checks:
  - `node --check state.js`
  - `node --check layout.js`
  - `node --check render.js`
  - `node --check interact.js`
  - `node --check export.js`
- Sanity test in browser:
  - add boxes with `+`
  - delete from canvas (`✕` and keyboard `Delete`)
  - generate/shuffle/undo
  - export PDF
