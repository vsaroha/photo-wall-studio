// ── Drag & Drop ──
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
    photo.w = Math.min(maxW, Math.max(0.5, startW + dx));
    photo.h = Math.min(maxH, Math.max(0.5, startH + dy));
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
  if (!selectedId) return;
  if (e.key === 'r' || e.key === 'R') {
    rotatePhoto(selectedId);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    placedPhotos = placedPhotos.filter(p => p.id !== selectedId);
    selectedId = null;
    renderCanvas();
    saveState();
  }
});

// Click on canvas background to deselect
document.getElementById('canvasWrapper').addEventListener('mousedown', (e) => {
  if (e.target === document.getElementById('canvasWrapper')) {
    selectedId = null;
    document.querySelectorAll('.photo-rect').forEach(el => el.classList.remove('selected'));
  }
});
