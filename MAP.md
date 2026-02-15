# App Map

## High-level architecture

The app is a single-page client app with global shared state and ordered script loading.

Load order in `index.html`:

1. `state.js`
2. `layout.js`
3. `render.js`
4. `interact.js`
5. `export.js`

Each later file depends on globals/functions from earlier files.

## Data model

Global state from `state.js`:

- `unit`: `in` or `cm`
- `photoEntries`: requested sizes/quantities
- `placedPhotos`: positioned rectangles on canvas
- `selectedId`, `selectedIds`: selection state
- `idCounter`: shared ID generator
- `layoutSeed`: variation seed for shuffle/regenerate
- `undoStack`: snapshots for undo
- `currentCanvas` (defined in `render.js`): canvas width/height in inches

Key object shapes:

- Photo entry: `{ id, w, h, qty, color }`
- Placed photo: `{ id, entryId, x, y, w, h, rotated, color }`

## Runtime flow

1. Init (`export.js`): `loadState()` runs; if prior placements exist, `renderCanvas()` runs; otherwise `runLayout()` runs.
2. User edits input/settings: `saveState()` runs, and layout-related changes trigger `autoRegenerate()` -> `runLayout()`.
3. Layout generation (`layout.js`): `runLayout()` expands entries, chooses strategy by `layoutStyle`, fills `placedPhotos`, fits canvas, then calls `renderCanvas()`.
4. Interaction (`interact.js`): drag/resize/rotate/selection mutates `placedPhotos`, then calls `renderCanvas()`, `checkOverlaps()`, and `saveState()`.
5. Export (`export.js`): `exportPDF()` builds and saves a PDF with optional labels/footer.

## File-level responsibilities

`state.js`
- Unit conversion, spacing/grid helpers
- Undo snapshots
- Photo entry CRUD
- Manual-mode append placement
- Persistence (`saveState` / `loadState`)

`layout.js`
- Strategy router (`runLayout`)
- Placement helpers (`placePhoto`, `normalizePositions`)
- Strategies: `layoutManualDesign`, `layoutBlockGrid`, `layoutMasonry`, `layoutAnchorSatellite`, `layoutTShape`, `layoutSkyline`, `layoutAlignedRows`, `layoutCloudShape`, `layoutShelfBinPack`, `layoutFillRectangle`
- Art presets and spacing tuning

`render.js`
- Canvas scaling and rectangle rendering
- Grid background rendering
- Gap annotation computation and draw
- Selection class updates
- Overlap/out-of-bounds detection and feedback

`interact.js`
- Drag move
- Resize handle behavior
- Rotate actions
- Multi-select and marquee selection
- Alignment helpers (`autoSpaceSelected`, `centerSelected`)
- Keyboard shortcuts (`Cmd/Ctrl+Z`, `R`, `Delete/Backspace`)

`export.js`
- Export options parsing
- Page dimension/orientation logic
- PDF draw pipeline with `jsPDF`
- Footer/legend and size summary
- Init wiring and change listeners

## Dependency map

- `layout.js` depends on conversion/state helpers from `state.js`.
- `render.js` depends on state helpers and `placedPhotos`.
- `interact.js` depends on render/state helpers and mutates `placedPhotos`.
- `export.js` depends on layout/render/state helpers and owns app bootstrap.

## UI map (by major panel)

- Units panel -> `setUnit`
- Layout settings -> `runLayout` via auto-regenerate
- Photo sizes panel -> `addPhoto`, `updateEntry`, `rotateEntry`, `removeEntry`
- Arrange selection -> `autoSpaceSelected`, `centerSelected`
- Export settings -> used by `exportPDF`
- Canvas area -> drag/resize/rotate/select interactions

## Persistence

`localStorage` key: `collage-planner`

Stored values include:

- Inputs and toggles
- Unit and entries
- Placed photo geometry
- Canvas dimensions
- Export settings
