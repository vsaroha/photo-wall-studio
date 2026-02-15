// ── State ──
let unit = 'in';
let photoEntries = []; // { id, w, h, qty, color } in inches
let placedPhotos = []; // { id, entryId, x, y, w, h, rotated, color }
let selectedId = null;
let selectedIds = [];
let idCounter = 0;
let layoutSeed = 0;
let regenTimer = null;

const COLORS = ['#e94560','#533483','#0f3460','#e07c24','#2ecc71','#3498db','#9b59b6','#1abc9c','#e74c3c','#f39c12'];

// ── Conversion ──
function toDisplay(inches) { return unit === 'cm' ? +(inches * 2.54).toFixed(1) : +inches.toFixed(2); }
function fromDisplay(val) { return unit === 'cm' ? val / 2.54 : val; }
function unitSuffix() { return unit === 'cm' ? 'cm' : 'in'; }
function getGridStep() {
  const raw = parseFloat(document.getElementById('gridSize').value);
  const inUnits = fromDisplay(Number.isFinite(raw) ? raw : 1);
  return Math.max(0.1, inUnits || 1);
}
function isSnapToGridEnabled() { return !!document.getElementById('snapToGrid').checked; }
function isGridVisible() { return !!document.getElementById('showGrid').checked; }
function isManualLayoutMode() { return document.getElementById('layoutStyle').value === 'manual'; }
function snapToGridValue(value) {
  if (!isSnapToGridEnabled()) return value;
  const step = getGridStep();
  return Math.round(value / step) * step;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function computeManualCanvas(spacing) {
  const baseW = (typeof currentCanvas !== 'undefined' && Number.isFinite(currentCanvas.w)) ? currentCanvas.w : 10;
  const baseH = (typeof currentCanvas !== 'undefined' && Number.isFinite(currentCanvas.h)) ? currentCanvas.h : 10;
  if (placedPhotos.length === 0) return { w: 10, h: 10 };
  let maxX = 0, maxY = 0;
  for (const p of placedPhotos) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { w: Math.max(10, baseW, maxX + spacing), h: Math.max(10, baseH, maxY + spacing) };
}

function findManualPlacement(w, h, spacing) {
  const step = isSnapToGridEnabled() ? getGridStep() : Math.max(0.2, spacing || 0.2);
  const bounds = computeManualCanvas(spacing);
  const searchW = bounds.w + Math.max(spacing * 4, w * 2);
  const searchH = bounds.h + Math.max(spacing * 4, h * 2);
  const start = Math.max(0, spacing);

  for (let y = start; y <= searchH; y += step) {
    for (let x = start; x <= searchW; x += step) {
      const candidate = { x, y, w, h };
      let collides = false;
      for (const p of placedPhotos) {
        if (rectsOverlap(candidate, p)) {
          collides = true;
          break;
        }
      }
      if (!collides) return { x, y };
    }
  }

  return { x: bounds.w + spacing, y: spacing };
}

function appendEntryToManualLayout(entry) {
  const spacing = fromDisplay(parseFloat(document.getElementById('spacing').value) || 0);
  for (let i = 0; i < entry.qty; i++) {
    const pos = findManualPlacement(entry.w, entry.h, spacing);
    placedPhotos.push({
      id: ++idCounter,
      entryId: entry.id,
      x: pos.x,
      y: pos.y,
      w: entry.w,
      h: entry.h,
      rotated: false,
      color: entry.color
    });
  }
  currentCanvas = computeManualCanvas(spacing);
}

function setUnit(u) {
  const sp = parseFloat(document.getElementById('spacing').value);
  const pw = parseFloat(document.getElementById('photoW').value);
  const ph = parseFloat(document.getElementById('photoH').value);
  const gs = parseFloat(document.getElementById('gridSize').value);

  const oldUnit = unit;
  unit = u;

  const convert = (v) => {
    if (oldUnit === 'in' && u === 'cm') return +(v * 2.54).toFixed(1);
    if (oldUnit === 'cm' && u === 'in') return +(v / 2.54).toFixed(2);
    return v;
  };

  document.getElementById('spacing').value = convert(sp);
  document.getElementById('photoW').value = convert(pw);
  document.getElementById('photoH').value = convert(ph);
  document.getElementById('gridSize').value = convert(gs);

  document.querySelectorAll('.unit-toggle button').forEach(b => b.classList.toggle('active', b.dataset.unit === u));
  document.querySelectorAll('.unit-label').forEach(el => el.textContent = unitSuffix());
  renderPhotoList();
  if (placedPhotos.length > 0) renderCanvas();
  saveState();
}

// Preset chips fill inputs with cm values (converted to current unit)
function addPresetCm(wCm, hCm) {
  const wIn = wCm / 2.54;
  const hIn = hCm / 2.54;
  document.getElementById('photoW').value = toDisplay(wIn);
  document.getElementById('photoH').value = toDisplay(hIn);
  document.getElementById('photoQty').value = 1;
  saveState();
}

// Swap W and H inputs (orientation toggle)
function swapPhotoInputs() {
  const wEl = document.getElementById('photoW');
  const hEl = document.getElementById('photoH');
  const tmp = wEl.value;
  wEl.value = hEl.value;
  hEl.value = tmp;
  saveState();
}

// Auto re-render when state changes (if there are entries)
function autoRegenerate() {
  if (photoEntries.length > 0) {
    runLayout();
  }
}

function scheduleRegenerate() {
  clearTimeout(regenTimer);
  regenTimer = setTimeout(() => {
    regenTimer = null;
    autoRegenerate();
  }, 120);
}

// ── Photo entries ──
function addPhoto() {
  const w = fromDisplay(parseFloat(document.getElementById('photoW').value));
  const h = fromDisplay(parseFloat(document.getElementById('photoH').value));
  const qty = parseInt(document.getElementById('photoQty').value) || 1;
  if (!w || !h || w <= 0 || h <= 0) { showToast('Enter valid dimensions'); return; }

  const color = COLORS[photoEntries.length % COLORS.length];
  const entry = { id: ++idCounter, w, h, qty, color };
  photoEntries.push(entry);
  renderPhotoList();

  if (isManualLayoutMode() && placedPhotos.length > 0) {
    appendEntryToManualLayout(entry);
    renderCanvas(currentCanvas);
    saveState();
    return;
  }

  saveState();
  autoRegenerate();
}

function removeEntry(id) {
  photoEntries = photoEntries.filter(e => e.id !== id);
  renderPhotoList();
  saveState();
  autoRegenerate();
}

// Rotate an existing entry's orientation (swap W↔H)
function rotateEntry(id) {
  const entry = photoEntries.find(e => e.id === id);
  if (!entry) return;
  const tmp = entry.w;
  entry.w = entry.h;
  entry.h = tmp;
  renderPhotoList();
  saveState();
  autoRegenerate();
}

function updateEntry(id, field, rawValue) {
  const entry = photoEntries.find(e => e.id === id);
  if (!entry) return;

  if (field === 'qty') {
    const qty = parseInt(rawValue, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      showToast('Quantity must be at least 1');
      renderPhotoList();
      return;
    }
    entry.qty = qty;
  } else if (field === 'w' || field === 'h') {
    const displayVal = parseFloat(rawValue);
    if (!Number.isFinite(displayVal) || displayVal <= 0) {
      showToast('Width/height must be positive');
      renderPhotoList();
      return;
    }
    entry[field] = fromDisplay(displayVal);
  }

  saveState();
  scheduleRegenerate();
}

function renderPhotoList() {
  const list = document.getElementById('photoList');
  list.innerHTML = photoEntries.map(e => {
    return `
    <div class="photo-item">
      <div class="swatch" style="background:${e.color}"></div>
      <div class="photo-item-fields">
        <label>W
          <input
            type="number"
            min="0.1"
            step="0.1"
            value="${toDisplay(e.w)}"
            onchange="updateEntry(${e.id}, 'w', this.value)"
            aria-label="Width for entry ${e.id}"
          >
        </label>
        <label>H
          <input
            type="number"
            min="0.1"
            step="0.1"
            value="${toDisplay(e.h)}"
            onchange="updateEntry(${e.id}, 'h', this.value)"
            aria-label="Height for entry ${e.id}"
          >
        </label>
        <label>Qty
          <input
            type="number"
            min="1"
            step="1"
            value="${e.qty}"
            onchange="updateEntry(${e.id}, 'qty', this.value)"
            aria-label="Quantity for entry ${e.id}"
          >
        </label>
      </div>
      <div class="photo-item-actions">
        <span class="photo-item-unit">${unitSuffix()}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="rotateEntry(${e.id})" title="Rotate orientation" aria-label="Rotate entry ${e.id}">↻</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeEntry(${e.id})" aria-label="Remove entry ${e.id}">✕</button>
      </div>
    </div>`;
  }).join('');
}

function clearAll() {
  photoEntries = [];
  placedPhotos = [];
  selectedId = null;
  selectedIds = [];
  layoutSeed = 0;
  renderPhotoList();
  document.getElementById('canvasWrapper').style.display = 'none';
  document.getElementById('emptyState').style.display = '';
  if (typeof setLayoutFeedback === 'function') {
    setLayoutFeedback('No layout generated yet.', 'info');
  }
  saveState();
}

// ── Persistence (localStorage) ──
function saveState() {
  const state = {
    unit,
    photoEntries,
    idCounter,
    layoutSeed,
    placedPhotos,
    currentCanvas: typeof currentCanvas !== 'undefined' ? currentCanvas : { w: 10, h: 10 },
    prefRows: document.getElementById('prefRows').value,
    prefCols: document.getElementById('prefCols').value,
    spacing: document.getElementById('spacing').value,
    layoutStyle: document.getElementById('layoutStyle').value,
    artDirection: document.getElementById('artDirection').value,
    gridSize: document.getElementById('gridSize').value,
    snapToGrid: document.getElementById('snapToGrid').checked,
    showGrid: document.getElementById('showGrid').checked,
    photoW: document.getElementById('photoW').value,
    photoH: document.getElementById('photoH').value,
    photoQty: document.getElementById('photoQty').value,
    exportName: document.getElementById('exportName').value,
    exportFormat: document.getElementById('exportFormat').value,
    exportOrientation: document.getElementById('exportOrientation').value,
    exportLabels: document.getElementById('exportLabels').checked,
    exportLegend: document.getElementById('exportLegend').checked,
  };
  try { localStorage.setItem('collage-planner', JSON.stringify(state)); } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('collage-planner');
    if (!raw) return;
    const state = JSON.parse(raw);

    unit = state.unit || 'in';
    photoEntries = state.photoEntries || [];
    idCounter = state.idCounter || 0;
    layoutSeed = state.layoutSeed || 0;
    selectedId = null;
    selectedIds = [];

    document.getElementById('prefRows').value = state.prefRows || '2';
    document.getElementById('prefCols').value = state.prefCols || '3';
    document.getElementById('spacing').value = state.spacing || '2';
    document.getElementById('layoutStyle').value = state.layoutStyle || 'centered';
    document.getElementById('artDirection').value = state.artDirection || 'balanced';
    document.getElementById('gridSize').value = state.gridSize || '1';
    document.getElementById('snapToGrid').checked = state.snapToGrid !== false;
    document.getElementById('showGrid').checked = state.showGrid === true;
    if (state.photoW) document.getElementById('photoW').value = state.photoW;
    if (state.photoH) document.getElementById('photoH').value = state.photoH;
    if (state.photoQty) document.getElementById('photoQty').value = state.photoQty;
    if (state.exportName) document.getElementById('exportName').value = state.exportName;
    document.getElementById('exportFormat').value = state.exportFormat || 'auto';
    document.getElementById('exportOrientation').value = state.exportOrientation || 'auto';
    document.getElementById('exportLabels').checked = state.exportLabels !== false;
    document.getElementById('exportLegend').checked = state.exportLegend !== false;

    if (Array.isArray(state.placedPhotos)) placedPhotos = state.placedPhotos;
    if (state.currentCanvas && Number.isFinite(state.currentCanvas.w) && Number.isFinite(state.currentCanvas.h)) {
      currentCanvas = state.currentCanvas;
    }

    document.querySelectorAll('.unit-toggle button').forEach(b => b.classList.toggle('active', b.dataset.unit === unit));
    document.querySelectorAll('.unit-label').forEach(el => el.textContent = unitSuffix());

    renderPhotoList();
  } catch(e) {}
}
