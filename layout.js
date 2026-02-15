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

function getArtDirection() {
  const el = document.getElementById('artDirection');
  return el ? el.value : 'balanced';
}

const ART_PRESETS = {
  balanced: {
    spacingScale: 1.0,
    arrangement: 'balanced',
    blockSlack: 0.32,
    masonryGapScale: 1.0,
    anchorBesideBias: 1.0,
    tTopRatio: 0.55,
    skylineWidthScale: 1.0,
    cloudSpread: 1.0,
    cloudJitter: 0.08,
    cloudRingScale: 1.0,
    cloudPaddingScale: 1.0,
    binWidthScale: 1.0,
    rectAspectBias: 1.0,
    fillAllowRotate: true
  },
  gallery: {
    spacingScale: 1.18,
    arrangement: 'strict',
    blockSlack: 0.14,
    masonryGapScale: 1.15,
    anchorBesideBias: 1.1,
    tTopRatio: 0.62,
    skylineWidthScale: 1.2,
    cloudSpread: 1.15,
    cloudJitter: 0.02,
    cloudRingScale: 1.15,
    cloudPaddingScale: 1.25,
    binWidthScale: 1.18,
    rectAspectBias: 1.2,
    fillAllowRotate: false
  },
  salon: {
    spacingScale: 0.72,
    arrangement: 'eclectic',
    blockSlack: 0.58,
    masonryGapScale: 0.72,
    anchorBesideBias: 0.82,
    tTopRatio: 0.5,
    skylineWidthScale: 0.84,
    cloudSpread: 0.8,
    cloudJitter: 0.24,
    cloudRingScale: 0.82,
    cloudPaddingScale: 0.75,
    binWidthScale: 0.84,
    rectAspectBias: 0.9,
    fillAllowRotate: true
  }
};

function getArtPreset() {
  return ART_PRESETS[getArtDirection()] || ART_PRESETS.balanced;
}

function getTunedSpacing(spacing, art) {
  if (spacing <= 0) return 0;
  return Math.max(0.1, spacing * art.spacingScale);
}

function sortByAreaDesc(a, b) {
  return (b.w * b.h) - (a.w * a.h) || b.h - a.h || b.w - a.w;
}

function sortByHeightDesc(a, b) {
  return b.h - a.h || b.w - a.w || sortByAreaDesc(a, b);
}

function interleaveLargeSmall(list) {
  const out = [];
  let i = 0, j = list.length - 1;
  while (i <= j) {
    out.push(list[i]);
    if (i !== j) out.push(list[j]);
    i++;
    j--;
  }
  return out;
}

function orderPhotosForArt(photos, art, mode) {
  const base = [...photos];
  base.sort(mode === 'height' ? sortByHeightDesc : sortByAreaDesc);
  if (art.arrangement === 'strict') return base;
  if (art.arrangement === 'eclectic') return interleaveLargeSmall(base);
  return shuffleWithSeed(base, Math.max(1, layoutSeed));
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
  const art = getArtPreset();
  const tunedSpacing = getTunedSpacing(spacing, art);
  placedPhotos = [];
  selectedId = null;
  selectedIds = [];

  const photos = expandPhotos();

  const style = getLayoutStyle();
  switch (style) {
    case 'manual': layoutManualDesign(photos, grid, tunedSpacing, art); break;
    case 'centered': layoutBlockGrid(photos, grid, tunedSpacing, art); break;
    case 'masonry':  layoutMasonry(photos, grid, tunedSpacing, art); break;
    case 'scattered': layoutAnchorSatellite(photos, grid, tunedSpacing, art); break;
    case 'brick':    layoutTShape(photos, grid, tunedSpacing, art); break;
    case 'spiral':   layoutSkyline(photos, grid, tunedSpacing, art); break;
    case 'topAligned': layoutAlignedRows(photos, grid, tunedSpacing, 'top', art); break;
    case 'bottomAligned': layoutAlignedRows(photos, grid, tunedSpacing, 'bottom', art); break;
    case 'cloud': layoutCloudShape(photos, grid, tunedSpacing, art); break;
    case 'binpack': layoutShelfBinPack(photos, grid, tunedSpacing, art); break;
    case 'fillRect': layoutFillRectangle(photos, grid, tunedSpacing, art); break;
    default:         layoutBlockGrid(photos, grid, tunedSpacing, art);
  }

  const fitCanvas = shrinkCanvasToFit(tunedSpacing);
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
// Strategy 0: MANUAL DESIGN BASE
// ═══════════════════════════════════════════════════════════════
function layoutManualDesign(photos, grid, spacing, art) {
  const ordered = orderPhotosForArt(photos, art, 'height');
  const widthBias = art.arrangement === 'strict' ? 1.12 : (art.arrangement === 'eclectic' ? 0.82 : 0.95);
  const targetW = estimateTargetWidth(ordered, grid, spacing, art) * widthBias;

  let x = spacing;
  let y = spacing;
  let rowH = 0;

  for (const p of ordered) {
    if (x > spacing && x + p.w > targetW - spacing * 0.2) {
      x = spacing;
      y += rowH + spacing;
      rowH = 0;
    }
    placePhoto(p, x, y);
    x += p.w + spacing;
    rowH = Math.max(rowH, p.h);
  }

  normalizePositions(spacing);
}


// ═══════════════════════════════════════════════════════════════
// Strategy 1: BLOCK GRID
// ═══════════════════════════════════════════════════════════════
// Pairs large photos with stacked smaller ones, then arranges
// blocks into the preferred number of rows, centered.
function layoutBlockGrid(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');
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
      if (stackH + needed <= targetH + spacing * art.blockSlack) {
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
  placeBlockRows(rowGroups, spacing, art);
}

function placeBlockRows(rowGroups, spacing, art) {
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
    rowMeta.push({ totalW: curX, startIdx, count: placedPhotos.length - startIdx, rowIndex: rowMeta.length });
    curY += rowH + spacing;
  }

  for (const rm of rowMeta) {
    const dx = (maxRowW - rm.totalW) / 2;
    const stagger = art.arrangement === 'eclectic'
      ? (rm.rowIndex % 2 === 0 ? spacing * 0.2 : -spacing * 0.2)
      : 0;
    if (Math.abs(dx) > 0.01) {
      for (let i = rm.startIdx; i < rm.startIdx + rm.count; i++) {
        placedPhotos[i].x += dx + stagger;
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// Strategy 2: MASONRY COLUMNS
// ═══════════════════════════════════════════════════════════════
// Uses preferred columns count. Photos fill the shortest column.
function layoutMasonry(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');
  const numCols = grid.cols;
  const maxPhotoW = Math.max(...sorted.map(p => p.w));
  const colStep = maxPhotoW + spacing * art.masonryGapScale;
  const cols = [];
  for (let c = 0; c < numCols; c++) {
    cols.push({ x: spacing + c * colStep, h: spacing });
  }

  for (const p of sorted) {
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
function layoutAnchorSatellite(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');

  const anchor = sorted[0];
  const rest = sorted.slice(1);

  // Anchor in center row, flanked by satellite photos. Extra rows below, centered.
  let besideCount = Math.min(rest.length, Math.max(0, Math.round((grid.cols - 1) * art.anchorBesideBias)));
  if (art.arrangement === 'strict' && besideCount % 2 !== 0 && besideCount < rest.length) {
    besideCount++;
  }
  const beside = rest.slice(0, besideCount);
  const below = rest.slice(besideCount);

  const splitAt = art.arrangement === 'eclectic'
    ? Math.ceil(beside.length * 0.35)
    : Math.floor(beside.length / 2);
  const leftBeside = beside.slice(0, splitAt);
  const rightBeside = beside.slice(splitAt);

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
function layoutTShape(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');

  if (sorted.length <= 2) {
    let x = spacing;
    for (const p of sorted) { placePhoto(p, x, spacing); x += p.w + spacing; }
    return;
  }

  const topCount = Math.max(2, Math.ceil(sorted.length * art.tTopRatio));
  const topPhotos = sorted.slice(0, topCount);
  const botPhotos = sorted.slice(topCount);

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
function layoutSkyline(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'height');

  const maxPhotoW = Math.max(...sorted.map(p => p.w));
  const estW = (grid.cols * maxPhotoW + (grid.cols + 1) * spacing) * art.skylineWidthScale;

  let skyline = [{ x: spacing, y: spacing, w: estW }];

  for (const p of sorted) {
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

// ═══════════════════════════════════════════════════════════════
// Strategy 6/7: TOP / BOTTOM ALIGNED ROWS
// ═══════════════════════════════════════════════════════════════
function layoutAlignedRows(photos, grid, spacing, mode, art) {
  const rowCount = Math.max(1, grid.rows);
  const ordered = orderPhotosForArt(photos, art, 'area');
  const groups = distributeEvenly(ordered, rowCount);
  const rows = groups.map((group) => ({
    items: art.arrangement === 'strict'
      ? [...group].sort((a, b) => b.h - a.h || b.w - a.w)
      : group,
    rowW: group.reduce((sum, p) => sum + p.w, 0) + spacing * Math.max(0, group.length - 1),
    rowH: Math.max(...group.map((p) => p.h))
  }));

  const maxRowW = Math.max(...rows.map((r) => r.rowW));
  let curY = spacing;
  for (const row of rows) {
    let x = spacing + (maxRowW - row.rowW) / 2;
    for (const p of row.items) {
      const y = mode === 'bottom' ? curY + (row.rowH - p.h) : curY;
      placePhoto(p, x, y);
      x += p.w + spacing;
    }
    curY += row.rowH + spacing;
  }

  normalizePositions(spacing);
}

// ═══════════════════════════════════════════════════════════════
// Strategy 8: CLOUD SHAPE
// ═══════════════════════════════════════════════════════════════
function layoutCloudShape(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');
  if (sorted.length === 0) return;

  const anchor = sorted[0];
  placePhoto(anchor, 0, 0);
  if (sorted.length === 1) { normalizePositions(spacing); return; }

  const avgW = sorted.reduce((sum, p) => sum + p.w, 0) / sorted.length;
  const avgH = sorted.reduce((sum, p) => sum + p.h, 0) / sorted.length;
  const ringBase = Math.max(5, Math.round(grid.cols * 2 * art.cloudRingScale));

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    let ring = 1;
    let slot = i - 1;
    while (slot >= ring * ringBase) {
      slot -= ring * ringBase;
      ring++;
    }

    const slotsInRing = ring * ringBase;
    const theta = (slot / slotsInRing) * Math.PI * 2 + ring * (0.2 + art.cloudJitter) + layoutSeed * (0.04 + art.cloudJitter * 0.15);
    const rx = ring * (Math.max(anchor.w, avgW) * 0.62 + spacing * 1.8) * art.cloudSpread;
    const ry = ring * (Math.max(anchor.h, avgH) * 0.52 + spacing * 1.6) * art.cloudSpread;
    const targetX = Math.cos(theta) * rx - p.w / 2;
    const targetY = Math.sin(theta) * ry - p.h / 2;

    const spot = findNearbyOpenSpot(p, targetX, targetY, spacing, art);
    placePhoto(p, spot.x, spot.y);
  }

  normalizePositions(spacing);
}

// ═══════════════════════════════════════════════════════════════
// Strategy 9: SHELF BIN PACKING
// ═══════════════════════════════════════════════════════════════
function layoutShelfBinPack(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'height');
  const targetW = estimateTargetWidth(sorted, grid, spacing, art) * art.binWidthScale;
  const shelves = [];
  let nextShelfY = spacing;

  for (const p of sorted) {
    let bestShelf = null;
    let bestRemain = Infinity;
    for (const shelf of shelves) {
      if (p.h > shelf.h) continue;
      if (shelf.x + p.w > targetW - spacing) continue;
      const remain = (targetW - spacing) - (shelf.x + p.w);
      if (remain < bestRemain) {
        bestRemain = remain;
        bestShelf = shelf;
      }
    }

    if (!bestShelf) {
      bestShelf = { y: nextShelfY, h: p.h, x: spacing };
      shelves.push(bestShelf);
      nextShelfY += p.h + spacing;
    }

    placePhoto(p, bestShelf.x, bestShelf.y);
    bestShelf.x += p.w + spacing;
  }

  normalizePositions(spacing);
}

// ═══════════════════════════════════════════════════════════════
// Strategy 10: FILL RECTANGLE
// ═══════════════════════════════════════════════════════════════
function layoutFillRectangle(photos, grid, spacing, art) {
  const sorted = orderPhotosForArt(photos, art, 'area');
  const innerW = Math.max(...sorted.map((p) => p.w), estimateTargetWidth(sorted, grid, spacing, art) - spacing * 2);
  const maxPhotoH = Math.max(...sorted.map((p) => p.h));
  const totalArea = sorted.reduce((sum, p) => sum + p.w * p.h, 0);
  const innerH = Math.max(maxPhotoH, totalArea / Math.max(0.1, innerW));
  let freeRects = [{ x: spacing, y: spacing, w: innerW, h: innerH }];

  for (const p of sorted) {
    let best = findBestFreeRect(freeRects, p, art.fillAllowRotate);

    if (!best) {
      const bottom = freeRects.reduce((m, r) => Math.max(m, r.y + r.h), spacing);
      freeRects.push({
        x: spacing,
        y: bottom + spacing,
        w: innerW,
        h: Math.max(maxPhotoH, p.h)
      });
      best = findBestFreeRect(freeRects, p, art.fillAllowRotate);
    }

    if (!best) {
      const fallbackY = placedPhotos.length > 0
        ? Math.max(...placedPhotos.map((pp) => pp.y + pp.h)) + spacing
        : spacing;
      placePhoto(p, spacing, fallbackY);
      continue;
    }

    const chosen = best.rotated
      ? { entryId: p.entryId, w: p.h, h: p.w, color: p.color }
      : p;
    placePhoto(chosen, best.rect.x, best.rect.y);
    splitFreeRect(freeRects, best.rectIndex, best.rect, chosen, spacing);
    freeRects = pruneContainedRects(freeRects).filter((r) => r.w > 0.2 && r.h > 0.2);
  }

  normalizePositions(spacing);
}

function findBestFreeRect(freeRects, photo, allowRotate) {
  let best = null;
  for (let i = 0; i < freeRects.length; i++) {
    const rect = freeRects[i];
    const candidates = [{ rotated: false, w: photo.w, h: photo.h }];
    if (allowRotate) candidates.push({ rotated: true, w: photo.h, h: photo.w });

    for (const c of candidates) {
      if (c.w > rect.w || c.h > rect.h) continue;
      const waste = (rect.w - c.w) * (rect.h - c.h);
      const shortSide = Math.min(rect.w - c.w, rect.h - c.h);
      if (!best || waste < best.waste || (Math.abs(waste - best.waste) < 0.01 && shortSide < best.shortSide)) {
        best = {
          rectIndex: i,
          rect,
          rotated: c.rotated,
          waste,
          shortSide
        };
      }
    }
  }
  return best;
}

function splitFreeRect(freeRects, rectIndex, rect, placed, spacing) {
  freeRects.splice(rectIndex, 1);
  const rightW = rect.w - placed.w - spacing;
  const bottomH = rect.h - placed.h - spacing;

  if (rightW > 0) {
    freeRects.push({
      x: rect.x + placed.w + spacing,
      y: rect.y,
      w: rightW,
      h: rect.h
    });
  }
  if (bottomH > 0) {
    freeRects.push({
      x: rect.x,
      y: rect.y + placed.h + spacing,
      w: placed.w,
      h: bottomH
    });
  }
}

function pruneContainedRects(rects) {
  return rects.filter((a, i) => !rects.some((b, j) => {
    if (i === j) return false;
    return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  }));
}

// ── Packing helpers ──
function estimateTargetWidth(photos, grid, spacing, art) {
  const totalArea = photos.reduce((sum, p) => sum + p.w * p.h, 0);
  const maxW = Math.max(...photos.map((p) => p.w));
  const aspect = Math.max(0.55, Math.min(2.2, (grid.cols / Math.max(1, grid.rows)) * art.rectAspectBias));
  return Math.max(maxW + spacing * 2, Math.sqrt(totalArea * aspect) + spacing * (grid.cols + 1));
}

function collidesAt(x, y, w, h, padding) {
  for (const placed of placedPhotos) {
    if (
      x < placed.x + placed.w + padding &&
      x + w + padding > placed.x &&
      y < placed.y + placed.h + padding &&
      y + h + padding > placed.y
    ) return true;
  }
  return false;
}

function findNearbyOpenSpot(photo, targetX, targetY, spacing, art) {
  const pad = spacing * 0.12 * art.cloudPaddingScale;
  if (!collidesAt(targetX, targetY, photo.w, photo.h, pad)) {
    return { x: targetX, y: targetY };
  }

  for (let i = 0; i < 220; i++) {
    const ring = 1 + Math.floor(i / 14);
    const angle = ((i % 14) / 14) * Math.PI * 2 + ring * (0.35 + art.cloudJitter * 0.6) + layoutSeed * 0.07;
    const radius = ring * (spacing * 0.9 + Math.min(photo.w, photo.h) * 0.18) * art.cloudSpread;
    const x = targetX + Math.cos(angle) * radius;
    const y = targetY + Math.sin(angle) * radius;
    if (!collidesAt(x, y, photo.w, photo.h, pad)) {
      return { x, y };
    }
  }

  return { x: targetX, y: targetY };
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
