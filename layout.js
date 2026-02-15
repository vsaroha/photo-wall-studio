// ── Layout Engine ──
//
// Uses preferred rows & columns to drive layout.
// All strategies distribute photos into the preferred grid shape.

function getPrefGrid() {
  const rows = parseInt(document.getElementById('prefRows').value) || 2;
  const cols = parseInt(document.getElementById('prefCols').value) || 3;
  return { rows, cols };
}

function shrinkCanvasToFit(spacing) {
  if (placedPhotos.length === 0) return { w: 10, h: 10 };
  let maxX = 0, maxY = 0;
  for (const p of placedPhotos) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { w: maxX + spacing, h: maxY + spacing };
}

function getSpacing() {
  return fromDisplay(parseFloat(document.getElementById('spacing').value) || 0);
}

function getLayoutStyle() {
  return document.getElementById('layoutStyle').value;
}

function generateDesign() {
  if (photoEntries.length === 0) { showToast('Add at least one photo size'); return; }
  layoutSeed = 0;
  runLayout();
}

function generateAnother() {
  if (photoEntries.length === 0) { showToast('Add at least one photo size'); return; }
  layoutSeed++;
  runLayout();
}

function expandPhotos() {
  let photos = [];
  photoEntries.forEach(entry => {
    for (let i = 0; i < entry.qty; i++) {
      photos.push({ entryId: entry.id, w: entry.w, h: entry.h, color: entry.color });
    }
  });
  return photos;
}

function runLayout() {
  const grid = getPrefGrid();
  const spacing = getSpacing();
  placedPhotos = [];
  selectedId = null;

  let photos = expandPhotos();
  photos = shuffleWithSeed(photos, layoutSeed);

  const style = getLayoutStyle();
  switch (style) {
    case 'centered': layoutBlockGrid(photos, grid, spacing); break;
    case 'masonry':  layoutMasonry(photos, grid, spacing); break;
    case 'scattered': layoutAnchorSatellite(photos, grid, spacing); break;
    case 'brick':    layoutTShape(photos, grid, spacing); break;
    case 'spiral':   layoutSkyline(photos, grid, spacing); break;
    default:         layoutBlockGrid(photos, grid, spacing);
  }

  const fitCanvas = shrinkCanvasToFit(spacing);
  renderCanvas(fitCanvas);
  saveState();
}


// ── Helper: place a photo ──
function placePhoto(p, x, y) {
  placedPhotos.push({
    id: ++idCounter, entryId: p.entryId,
    x, y, w: p.w, h: p.h, rotated: false, color: p.color
  });
}

// ── Helper: normalize positions to start at (spacing, spacing) ──
function normalizePositions(spacing) {
  if (placedPhotos.length === 0) return;
  let minX = Infinity, minY = Infinity;
  for (const p of placedPhotos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  const dx = spacing - minX, dy = spacing - minY;
  for (const p of placedPhotos) { p.x += dx; p.y += dy; }
}

// ── Helper: distribute N items into K buckets as evenly as possible ──
function distributeEvenly(items, k) {
  const buckets = [];
  const base = Math.floor(items.length / k);
  let extra = items.length % k;
  let idx = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    buckets.push(items.slice(idx, idx + size));
    idx += size;
  }
  return buckets.filter(b => b.length > 0);
}


// ═══════════════════════════════════════════════════════════════
// Strategy 1: BLOCK GRID
// ═══════════════════════════════════════════════════════════════
// Pairs large photos with stacked smaller ones, then arranges
// blocks into the preferred number of rows, centered.
function layoutBlockGrid(photos, grid, spacing) {
  const sorted = [...photos].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const used = new Set();
  const blocks = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const big = sorted[i];
    used.add(i);

    const stack = [];
    let stackH = 0;
    const targetH = big.h;

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const s = sorted[j];
      if (s.h >= big.h) continue;
      const needed = stack.length > 0 ? s.h + spacing : s.h;
      if (stackH + needed <= targetH + spacing * 0.3) {
        stack.push({ idx: j, photo: s });
        stackH += needed;
      }
      if (stackH >= targetH - spacing) break;
    }

    if (stack.length > 0) {
      stack.forEach(s => used.add(s.idx));
      const stackW = Math.max(...stack.map(s => s.photo.w));
      const blockW = big.w + spacing + stackW;
      const items = [{ photo: big, relX: 0, relY: 0 }];

      const totalStackH = stack.reduce((s, si) => s + si.photo.h, 0) + spacing * (stack.length - 1);
      let sy = (targetH - totalStackH) / 2;
      for (const s of stack) {
        const sx = big.w + spacing + (stackW - s.photo.w) / 2;
        items.push({ photo: s.photo, relX: sx, relY: sy });
        sy += s.photo.h + spacing;
      }
      blocks.push({ w: blockW, h: targetH, items });
    } else {
      blocks.push({ w: big.w, h: big.h, items: [{ photo: big, relX: 0, relY: 0 }] });
    }
  }

  const rowGroups = distributeEvenly(blocks, grid.rows);
  placeBlockRows(rowGroups, spacing);
}

function placeBlockRows(rowGroups, spacing) {
  let curY = spacing;
  let maxRowW = 0;
  const rowMeta = [];

  for (const row of rowGroups) {
    const rowH = Math.max(...row.map(b => b.h));
    let curX = spacing;
    const startIdx = placedPhotos.length;

    for (const block of row) {
      const blockOffY = (rowH - block.h) / 2;
      for (const item of block.items) {
        placePhoto(item.photo, curX + item.relX, curY + blockOffY + item.relY);
      }
      curX += block.w + spacing;
    }

    maxRowW = Math.max(maxRowW, curX);
    rowMeta.push({ totalW: curX, startIdx, count: placedPhotos.length - startIdx });
    curY += rowH + spacing;
  }

  for (const rm of rowMeta) {
    const dx = (maxRowW - rm.totalW) / 2;
    if (Math.abs(dx) > 0.01) {
      for (let i = rm.startIdx; i < rm.startIdx + rm.count; i++) {
        placedPhotos[i].x += dx;
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// Strategy 2: MASONRY COLUMNS
// ═══════════════════════════════════════════════════════════════
// Uses preferred columns count. Photos fill the shortest column.
function layoutMasonry(photos, grid, spacing) {
  photos.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const numCols = grid.cols;
  const maxPhotoW = Math.max(...photos.map(p => p.w));
  const cols = [];
  for (let c = 0; c < numCols; c++) {
    cols.push({ x: spacing + c * (maxPhotoW + spacing), h: spacing });
  }

  for (const p of photos) {
    let minC = 0;
    for (let c = 1; c < numCols; c++) {
      if (cols[c].h < cols[minC].h) minC = c;
    }
    placePhoto(p, cols[minC].x, cols[minC].h);
    cols[minC].h += p.h + spacing;
  }
}


// ═══════════════════════════════════════════════════════════════
// Strategy 3: ANCHOR + SATELLITE
// ═══════════════════════════════════════════════════════════════
// Large center anchor, smaller photos arranged in 4 non-overlapping zones.
// Right: column to the right, top-aligned with anchor
// Left: column to the left, top-aligned with anchor  
// Bottom: row below, spanning full width (anchor + right col)
// Top: row above, spanning full width (anchor + right col)
function layoutAnchorSatellite(photos, grid, spacing) {
  photos.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const anchor = photos[0];
  const rest = photos.slice(1);

  // Anchor in center row, flanked by satellite photos. Extra rows below, centered.
  const besideCount = Math.min(rest.length, Math.max(0, grid.cols - 1));
  const beside = rest.slice(0, besideCount);
  const below = rest.slice(besideCount);

  const leftBeside = beside.slice(0, Math.floor(beside.length / 2));
  const rightBeside = beside.slice(Math.floor(beside.length / 2));

  const rowH = Math.max(anchor.h, ...beside.map(p => p.h));
  let curX = 0;

  for (const p of leftBeside) {
    placePhoto(p, curX, (rowH - p.h) / 2);
    curX += p.w + spacing;
  }

  placePhoto(anchor, curX, (rowH - anchor.h) / 2);
  curX += anchor.w + spacing;

  for (const p of rightBeside) {
    placePhoto(p, curX, (rowH - p.h) / 2);
    curX += p.w + spacing;
  }

  const topRowW = curX - spacing;

  if (below.length > 0) {
    const rowGroups = distributeEvenly(below.map(p => ({
      w: p.w, h: p.h, items: [{ photo: p, relX: 0, relY: 0 }]
    })), Math.max(1, grid.rows - 1));

    let curY = rowH + spacing;
    for (const row of rowGroups) {
      const rh = Math.max(...row.map(b => b.h));
      let rx = 0;
      const rowPhotos = [];
      for (const block of row) {
        for (const item of block.items) {
          placePhoto(item.photo, rx, curY + (rh - block.h) / 2);
          rowPhotos.push(placedPhotos[placedPhotos.length - 1]);
        }
        rx += block.w + spacing;
      }
      const rowW = rx - spacing;
      const dx = (topRowW - rowW) / 2;
      if (Math.abs(dx) > 0.01) {
        for (const rp of rowPhotos) rp.x += dx;
      }
      curY += rh + spacing;
    }
  }

  normalizePositions(spacing);
}


// ═══════════════════════════════════════════════════════════════
// Strategy 4: T-SHAPE
// ═══════════════════════════════════════════════════════════════
// Top row wider, bottom row(s) narrower and centered.
function layoutTShape(photos, grid, spacing) {
  photos.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  if (photos.length <= 2) {
    let x = spacing;
    for (const p of photos) { placePhoto(p, x, spacing); x += p.w + spacing; }
    return;
  }

  const topCount = Math.max(2, Math.ceil(photos.length * 0.55));
  const topPhotos = photos.slice(0, topCount);
  const botPhotos = photos.slice(topCount);

  const topRowH = Math.max(...topPhotos.map(p => p.h));
  let topX = spacing;
  for (const p of topPhotos) {
    placePhoto(p, topX, spacing + (topRowH - p.h) / 2);
    topX += p.w + spacing;
  }
  const topTotalW = topX;

  if (botPhotos.length === 0) return;

  const botRowH = Math.max(...botPhotos.map(p => p.h));
  const botTotalW = botPhotos.reduce((s, p) => s + p.w, 0) + spacing * (botPhotos.length - 1);
  let botStartX = spacing + (topTotalW - spacing * 2 - botTotalW) / 2;
  if (botStartX < spacing) botStartX = spacing;
  const botY = spacing + topRowH + spacing;

  for (const p of botPhotos) {
    placePhoto(p, botStartX, botY + (botRowH - p.h) / 2);
    botStartX += p.w + spacing;
  }
}


// ═══════════════════════════════════════════════════════════════
// Strategy 5: SKYLINE PACK (tight bin-packing)
// ═══════════════════════════════════════════════════════════════
// Uses preferred columns to estimate width, then skyline algorithm.
function layoutSkyline(photos, grid, spacing) {
  photos.sort((a, b) => b.h - a.h || b.w - a.w);

  const maxPhotoW = Math.max(...photos.map(p => p.w));
  const estW = grid.cols * maxPhotoW + (grid.cols + 1) * spacing;

  let skyline = [{ x: spacing, y: spacing, w: estW }];

  for (const p of photos) {
    let bestY = Infinity, bestX = 0, bestFound = false;

    // Try each segment as a starting position
    for (let i = 0; i < skyline.length; i++) {
      const startX = skyline[i].x;
      // Check if photo fits starting from this segment (may span multiple)
      let maxY = 0, spanW = 0;
      let fits = true;
      for (let j = i; j < skyline.length && spanW < p.w; j++) {
        maxY = Math.max(maxY, skyline[j].y);
        spanW += skyline[j].w;
      }
      if (spanW < p.w) continue; // doesn't fit even spanning all remaining segments

      if (maxY < bestY) {
        bestY = maxY;
        bestX = startX;
        bestFound = true;
      }
    }

    if (!bestFound) {
      // Extend skyline to the right
      const maxRight = skyline.length > 0
        ? Math.max(...skyline.map(s => s.x + s.w))
        : spacing;
      bestX = maxRight + spacing;
      bestY = spacing;
      // Add a new wide segment so future photos can fit
      skyline.push({ x: bestX, y: spacing, w: estW });
    }

    placePhoto(p, bestX, bestY);
    updateSkyline(skyline, bestX, p.w, bestY + p.h + spacing);
  }

  normalizePositions(spacing);
}

function updateSkyline(skyline, x, w, newY) {
  const right = x + w;
  const newSegments = [];

  for (const seg of skyline) {
    const segRight = seg.x + seg.w;
    if (segRight <= x || seg.x >= right) {
      newSegments.push(seg);
    } else {
      if (seg.x < x) newSegments.push({ x: seg.x, y: seg.y, w: x - seg.x });
      if (segRight > right) newSegments.push({ x: right, y: seg.y, w: segRight - right });
    }
  }

  newSegments.push({ x, y: newY, w });
  newSegments.sort((a, b) => a.x - b.x);

  const merged = [newSegments[0]];
  for (let i = 1; i < newSegments.length; i++) {
    const last = merged[merged.length - 1];
    const cur = newSegments[i];
    if (Math.abs(last.y - cur.y) < 0.01 && Math.abs((last.x + last.w) - cur.x) < 0.01) {
      last.w += cur.w;
    } else {
      merged.push(cur);
    }
  }

  skyline.length = 0;
  skyline.push(...merged);
}


// ── Helpers ──

function shuffleWithSeed(arr, seed) {
  const a = [...arr];
  if (seed === 0) return a;
  let s = seed;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
