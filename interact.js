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

function groupSelectionLanes(photos, axis) {
  if (!photos || photos.length === 0) return [];
  const orthoStartKey = axis === 'x' ? 'y' : 'x';
  const orthoSizeKey = axis === 'x' ? 'h' : 'w';
  const ordered = [...photos].sort((a, b) => {
    const ac = a[orthoStartKey] + a[orthoSizeKey] / 2;
    const bc = b[orthoStartKey] + b[orthoSizeKey] / 2;
    return ac - bc;
  });
  const lanes = [];

  ordered.forEach((p) => {
    const pStart = p[orthoStartKey];
    const pEnd = pStart + p[orthoSizeKey];
    let bestLane = null;
    let bestOverlap = -Infinity;

    lanes.forEach((lane) => {
      const overlap = Math.min(pEnd, lane.end) - Math.max(pStart, lane.start);
      const laneSize = Math.max(0.001, lane.end - lane.start);
      const minSize = Math.min(p[orthoSizeKey], laneSize);
      const minRequired = Math.max(0.08, minSize * 0.22);
      if (overlap > minRequired && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLane = lane;
      }
    });

    if (!bestLane) {
      lanes.push({ start: pStart, end: pEnd, photos: [p] });
      return;
    }

    bestLane.photos.push(p);
    bestLane.start = Math.min(bestLane.start, pStart);
    bestLane.end = Math.max(bestLane.end, pEnd);
  });

  return lanes
    .sort((a, b) => a.start - b.start)
    .map((lane) => lane.photos);
}

function autoSpaceGroup(group, axis, canvasSpan) {
  if (!group || group.length < 2) return true;
  const sorted = [...group].sort((a, b) => axis === 'y' ? a.y - b.y : a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanStart = axis === 'y' ? first.y : first.x;
  const spanEnd = axis === 'y' ? (last.y + last.h) : (last.x + last.w);
  const spanSize = Math.max(0, spanEnd - spanStart);
  const totalSize = sorted.reduce((sum, p) => sum + (axis === 'y' ? p.h : p.w), 0);

  if (totalSize > canvasSpan + 1e-6) return false;

  const gaps = sorted.length - 1;
  const targetSpan = Math.max(spanSize, totalSize);
  const maxStart = Math.max(0, canvasSpan - targetSpan);
  const boundedStart = Math.min(Math.max(0, spanStart), maxStart);
  const gapSize = gaps > 0 ? (targetSpan - totalSize) / gaps : 0;

  let cursor = boundedStart;
  sorted.forEach((p) => {
    if (axis === 'y') {
      p.y = cursor;
      cursor += p.h + gapSize;
    } else {
      p.x = cursor;
      cursor += p.w + gapSize;
    }
  });
  return true;
}

function autoSpaceSelected(axis) {
  const photos = getSelectionPhotos();
  if (photos.length < 2) {
    showToast('Select at least 2 photos');
    return;
  }

  const canvasSpan = axis === 'y' ? currentCanvas.h : currentCanvas.w;
  const lanes = groupSelectionLanes(photos, axis);
  const laneGroups = lanes.length > 0 ? lanes : [photos];
  const hasAnyGroup = laneGroups.some(group => group.length > 1);
  if (!hasAnyGroup) {
    showToast('Select at least 2 aligned photos');
    return;
  }

  const allFit = laneGroups.every((group) => {
    if (group.length < 2) return true;
    const totalSize = group.reduce((sum, p) => sum + (axis === 'y' ? p.h : p.w), 0);
    return totalSize <= canvasSpan + 1e-6;
  });
  if (!allFit) {
    showToast(`Auto-Space ${axis.toUpperCase()} can't fit one or more groups on canvas`);
    return;
  }

  pushUndoState();
  laneGroups.forEach((group) => {
    if (group.length < 2) return;
    autoSpaceGroup(group, axis, canvasSpan);
  });

  keepAllPhotosInCanvas(photos);
  renderCanvas();
  saveState();
}

function centerSelected(axis) {
  const photos = getSelectionPhotos();
  if (photos.length === 0) {
    showToast('Select one or more photos');
    return;
  }
  pushUndoState();

  const b = getSelectionBounds(photos);
  if (!b) return;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;

  if (axis === 'x') {
    const dx = currentCanvas.w / 2 - cx;
    photos.forEach((p) => { p.x += dx; });
  } else if (axis === 'y') {
    const dy = currentCanvas.h / 2 - cy;
    photos.forEach((p) => { p.y += dy; });
  } else {
    const dx = currentCanvas.w / 2 - cx;
    const dy = currentCanvas.h / 2 - cy;
    photos.forEach(p => { p.x += dx; p.y += dy; });
  }
  shiftSelectionIntoCanvas(photos);

  renderCanvas();
  saveState();
}

function isTextInputTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName ? String(target.tagName).toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function moveSelectedPhotosBy(deltaX, deltaY, opts) {
  const preview = !!(opts && opts.preview);
  const photos = getSelectionPhotos();
  if (photos.length === 0) return false;

  const b = getSelectionBounds(photos);
  if (!b) return false;

  let dx = deltaX;
  let dy = deltaY;

  if (dx < 0) dx = Math.max(dx, -b.minX);
  else if (dx > 0) dx = Math.min(dx, currentCanvas.w - b.maxX);

  if (dy < 0) dy = Math.max(dy, -b.minY);
  else if (dy > 0) dy = Math.min(dy, currentCanvas.h - b.maxY);

  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;

  if (preview) return true;

  photos.forEach((p) => {
    p.x += dx;
    p.y += dy;
  });
  return true;
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
  pushUndoState();

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
    pushUndoState();
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
  pushUndoState();
  const tmp = photo.w;
  photo.w = photo.h;
  photo.h = tmp;
  photo.rotated = !photo.rotated;
  keepPhotoInCanvas(photo);
  renderCanvas();
  saveState();
}

function removePhotosByIds(ids) {
  const toRemove = new Set((ids || []).filter(Number.isFinite));
  if (toRemove.size === 0) return;

  const removed = placedPhotos.filter((p) => toRemove.has(p.id));
  if (removed.length === 0) return;

  const removedByEntry = new Map();
  removed.forEach((p) => {
    if (!Number.isFinite(p.entryId)) return;
    removedByEntry.set(p.entryId, (removedByEntry.get(p.entryId) || 0) + 1);
  });

  placedPhotos = placedPhotos.filter((p) => !toRemove.has(p.id));
  if (removedByEntry.size > 0) {
    photoEntries = photoEntries
      .map((entry) => {
        const dec = removedByEntry.get(entry.id) || 0;
        if (!dec) return entry;
        const nextQty = entry.qty - dec;
        return nextQty > 0 ? { ...entry, qty: nextQty } : null;
      })
      .filter(Boolean);
  }

  selectedIds = selectedIds.filter((id) => !toRemove.has(id));
  selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  renderPhotoList();
}

function refreshCanvasAfterRemoval() {
  if (placedPhotos.length > 0) {
    renderCanvas();
    return;
  }
  const wrapper = document.getElementById('canvasWrapper');
  const empty = document.getElementById('emptyState');
  if (wrapper) wrapper.style.display = 'none';
  if (empty) empty.style.display = '';
  if (typeof setLayoutFeedback === 'function') {
    setLayoutFeedback('No layout generated yet.', 'info');
  }
}

function deletePhoto(id, e) {
  if (e) e.stopPropagation();
  pushUndoState();
  removePhotosByIds([id]);
  refreshCanvasAfterRemoval();
  saveState();
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undoLastAction();
    return;
  }

  const activeIds = getActiveSelectionIds();
  if (activeIds.length === 0) return;
  const nudgeByKey = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0]
  };
  const nudge = nudgeByKey[e.key];
  if (nudge) {
    if (isTextInputTarget(e.target)) return;
    const step = getGridStep();
    if (!Number.isFinite(step) || step <= 0) return;
    e.preventDefault();
    const dx = nudge[0] * step;
    const dy = nudge[1] * step;
    if (!moveSelectedPhotosBy(dx, dy, { preview: true })) return;
    pushUndoState();
    moveSelectedPhotosBy(dx, dy);
    renderCanvas();
    saveState();
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    pushUndoState();
    activeIds.forEach((id) => {
      const p = placedPhotos.find(photo => photo.id === id);
      if (!p) return;
      const t = p.w;
      p.w = p.h;
      p.h = t;
      p.rotated = !p.rotated;
      keepPhotoInCanvas(p);
    });
    renderCanvas();
    saveState();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    pushUndoState();
    removePhotosByIds(activeIds);
    refreshCanvasAfterRemoval();
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
