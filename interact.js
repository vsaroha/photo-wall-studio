// ── Drag & Drop ──
function getActiveSelectionIds() {
  if (Array.isArray(selectedIds) && selectedIds.length > 0) return [...selectedIds];
  if (selectedId) return [selectedId];
  return [];
}

function getSelectionPhotos() {
  const ids = getActiveSelectionIds();
  return ids.map(id => placedPhotos.find(p => p.id === id)).filter(Boolean);
}

function getSelectionBounds(photos) {
  if (!photos || photos.length === 0) return null;
  const minX = Math.min(...photos.map(p => p.x));
  const minY = Math.min(...photos.map(p => p.y));
  const maxX = Math.max(...photos.map(p => p.x + p.w));
  const maxY = Math.max(...photos.map(p => p.y + p.h));
  return { minX, minY, maxX, maxY };
}

function shiftSelectionIntoCanvas(photos) {
  const b = getSelectionBounds(photos);
  if (!b) return;
  let dx = 0, dy = 0;
  if (b.minX < 0) dx = -b.minX;
  else if (b.maxX > currentCanvas.w) dx = currentCanvas.w - b.maxX;
  if (b.minY < 0) dy = -b.minY;
  else if (b.maxY > currentCanvas.h) dy = currentCanvas.h - b.maxY;
  if (dx !== 0 || dy !== 0) {
    photos.forEach(p => { p.x += dx; p.y += dy; });
  }
}

function autoSpaceSelected(axis) {
  const photos = getSelectionPhotos();
  if (photos.length < 2) {
    showToast('Select at least 2 photos');
    return;
  }

  const sorted = [...photos].sort((a, b) => axis === 'y' ? a.y - b.y : a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanStart = axis === 'y' ? first.y : first.x;
  const spanEnd = axis === 'y' ? (last.y + last.h) : (last.x + last.w);
  const totalSize = sorted.reduce((sum, p) => sum + (axis === 'y' ? p.h : p.w), 0);
  const gaps = sorted.length - 1;
  const gapSize = gaps > 0 ? Math.max(0, (spanEnd - spanStart - totalSize) / gaps) : 0;

  let cursor = spanStart;
  sorted.forEach((p) => {
    if (axis === 'y') {
      p.y = cursor;
      cursor += p.h + gapSize;
    } else {
      p.x = cursor;
      cursor += p.w + gapSize;
    }
  });

  shiftSelectionIntoCanvas(photos);
  renderCanvas();
  saveState();
}

function centerSelected(axis) {
  const photos = getSelectionPhotos();
  if (photos.length === 0) {
    showToast('Select one or more photos');
    return;
  }

  const b = getSelectionBounds(photos);
  if (!b) return;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  let dx = 0, dy = 0;

  if (axis === 'x' || axis === 'both') dx = currentCanvas.w / 2 - cx;
  if (axis === 'y' || axis === 'both') dy = currentCanvas.h / 2 - cy;
  photos.forEach(p => { p.x += dx; p.y += dy; });
  shiftSelectionIntoCanvas(photos);

  renderCanvas();
  saveState();
}

function intersectsRect(photo, rect) {
  return (
    photo.x < rect.x + rect.w &&
    photo.x + photo.w > rect.x &&
    photo.y < rect.y + rect.h &&
    photo.y + photo.h > rect.y
  );
}

function getCanvasPoint(e, wrapperRect, scale) {
  return {
    x: Math.max(0, Math.min(currentCanvas.w, (e.clientX - wrapperRect.left) / scale)),
    y: Math.max(0, Math.min(currentCanvas.h, (e.clientY - wrapperRect.top) / scale))
  };
}

function startDrag(e, id) {
  e.preventDefault();
  const photo = placedPhotos.find(p => p.id === id);
  if (!photo) return;

  const scale = getScale();
  const wrapper = document.getElementById('canvasWrapper');
  const rect = wrapper.getBoundingClientRect();
  const el = wrapper.querySelector(`.photo-rect[data-id="${id}"]`);
  el.classList.add('dragging');

  const offsetX = e.clientX - rect.left - photo.x * scale;
  const offsetY = e.clientY - rect.top - photo.y * scale;
  const canvas = currentCanvas;

  function onMove(e2) {
    let nx = (e2.clientX - rect.left - offsetX) / scale;
    let ny = (e2.clientY - rect.top - offsetY) / scale;
    if (isSnapToGridEnabled()) {
      nx = snapToGridValue(nx);
      ny = snapToGridValue(ny);
    }
    nx = Math.max(0, Math.min(nx, canvas.w - photo.w));
    ny = Math.max(0, Math.min(ny, canvas.h - photo.h));
    photo.x = nx;
    photo.y = ny;
    el.style.left = (nx * scale) + 'px';
    el.style.top = (ny * scale) + 'px';
    checkOverlaps();
  }

  function onUp() {
    el.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    saveState();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Resize ──
(function initResize() {
  let resizing = false, resizeId = null, startX, startY, startW, startH;

  document.addEventListener('mousedown', (e) => {
    if (!e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    resizeId = parseInt(e.target.dataset.id);
    const photo = placedPhotos.find(p => p.id === resizeId);
    if (!photo) return;
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = photo.w; startH = photo.h;
    selectPhoto(resizeId);
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const scale = getScale();
    const photo = placedPhotos.find(p => p.id === resizeId);
    if (!photo) return;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    const maxW = Math.max(0.5, currentCanvas.w - photo.x);
    const maxH = Math.max(0.5, currentCanvas.h - photo.y);
    let nextW = Math.min(maxW, Math.max(0.5, startW + dx));
    let nextH = Math.min(maxH, Math.max(0.5, startH + dy));
    if (isSnapToGridEnabled()) {
      nextW = Math.max(0.5, Math.min(maxW, snapToGridValue(nextW)));
      nextH = Math.max(0.5, Math.min(maxH, snapToGridValue(nextH)));
    }
    photo.w = nextW;
    photo.h = nextH;
    renderCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    saveState();
  });
})();

// ── Rotate ──
function rotatePhoto(id, e) {
  if (e) e.stopPropagation();
  const photo = placedPhotos.find(p => p.id === id);
  if (!photo) return;
  const tmp = photo.w;
  photo.w = photo.h;
  photo.h = tmp;
  photo.rotated = !photo.rotated;
  renderCanvas();
  saveState();
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  const activeIds = getActiveSelectionIds();
  if (activeIds.length === 0) return;
  if (e.key === 'r' || e.key === 'R') {
    activeIds.forEach((id) => {
      const p = placedPhotos.find(photo => photo.id === id);
      if (!p) return;
      const t = p.w;
      p.w = p.h;
      p.h = t;
      p.rotated = !p.rotated;
    });
    renderCanvas();
    saveState();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    const toRemove = new Set(activeIds);
    placedPhotos = placedPhotos.filter(p => !toRemove.has(p.id));
    selectedId = null;
    selectedIds = [];
    renderCanvas();
    saveState();
  }
});

// ── Canvas marquee selection ──
(function initCanvasMarqueeSelection() {
  const wrapper = document.getElementById('canvasWrapper');
  let marqueeEl = null;
  let start = null;
  let additive = false;
  let baseIds = [];
  let moved = false;

  wrapper.addEventListener('mousedown', (e) => {
    if (e.target !== wrapper) return;
    e.preventDefault();

    const scale = getScale();
    const wrapperRect = wrapper.getBoundingClientRect();
    start = getCanvasPoint(e, wrapperRect, scale);
    additive = e.shiftKey || e.ctrlKey || e.metaKey;
    baseIds = additive ? getActiveSelectionIds() : [];
    moved = false;

    marqueeEl = document.createElement('div');
    marqueeEl.className = 'marquee-box';
    wrapper.appendChild(marqueeEl);

    function onMove(e2) {
      const pt = getCanvasPoint(e2, wrapperRect, scale);
      const x = Math.min(start.x, pt.x);
      const y = Math.min(start.y, pt.y);
      const w = Math.abs(pt.x - start.x);
      const h = Math.abs(pt.y - start.y);

      if (w > 0.05 || h > 0.05) moved = true;

      marqueeEl.style.left = `${x * scale}px`;
      marqueeEl.style.top = `${y * scale}px`;
      marqueeEl.style.width = `${w * scale}px`;
      marqueeEl.style.height = `${h * scale}px`;

      const rect = { x, y, w, h };
      const hitIds = placedPhotos.filter(p => intersectsRect(p, rect)).map(p => p.id);
      const nextIds = additive
        ? Array.from(new Set([...baseIds, ...hitIds]))
        : hitIds;
      setSelectedIds(nextIds);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (marqueeEl) marqueeEl.remove();
      marqueeEl = null;

      if (!moved && !additive) {
        setSelectedIds([]);
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();
