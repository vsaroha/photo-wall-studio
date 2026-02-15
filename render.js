// ── Rendering ──
// Current canvas dimensions (set by layout, used by drag/export)
let currentCanvas = { w: 10, h: 10 };

function getScale() {
  const mainArea = document.getElementById('mainArea');
  const maxW = mainArea.clientWidth - 100;
  const maxH = mainArea.clientHeight - 80;
  return Math.min(maxW / currentCanvas.w, maxH / currentCanvas.h, 96);
}

function renderCanvas(canvasDims) {
  if (canvasDims) currentCanvas = canvasDims;
  const canvas = currentCanvas;
  const scale = getScale();
  const wrapper = document.getElementById('canvasWrapper');
  const empty = document.getElementById('emptyState');

  empty.style.display = 'none';
  wrapper.style.display = '';
  wrapper.style.width = (canvas.w * scale) + 'px';
  wrapper.style.height = (canvas.h * scale) + 'px';

  // Dimension labels
  document.getElementById('dimTop').textContent = `${toDisplay(canvas.w)} ${unitSuffix()}`;
  document.getElementById('dimLeft').textContent = `${toDisplay(canvas.h)} ${unitSuffix()}`;

  // Clear old rects
  wrapper.querySelectorAll('.photo-rect').forEach(el => el.remove());

  // Render photos
  placedPhotos.forEach(p => {
    const el = document.createElement('div');
    el.className = 'photo-rect' + (p.id === selectedId ? ' selected' : '');
    el.dataset.id = p.id;
    el.style.left = (p.x * scale) + 'px';
    el.style.top = (p.y * scale) + 'px';
    el.style.width = (p.w * scale) + 'px';
    el.style.height = (p.h * scale) + 'px';
    el.style.background = p.color + 'cc';

    el.innerHTML = `
      <span>${toDisplay(p.w)}×${toDisplay(p.h)}</span>
      <span class="dim-text">${unitSuffix()}</span>
      <button class="rotate-btn" onclick="rotatePhoto(${p.id}, event)" title="Rotate">↻</button>
      <div class="resize-handle" data-id="${p.id}"></div>
    `;

    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      if (e.target.classList.contains('rotate-btn')) return;
      selectPhoto(p.id);
      startDrag(e, p.id);
    });

    wrapper.appendChild(el);
  });

  checkOverlaps();
}

function setLayoutFeedback(message, tone) {
  const el = document.getElementById('layoutFeedback');
  if (!el) return;
  el.className = `layout-feedback ${tone || 'info'}`;
  el.textContent = message;
}

function selectPhoto(id) {
  selectedId = id;
  document.querySelectorAll('.photo-rect').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === id);
  });
}

// ── Overlap detection ──
function checkOverlaps() {
  const rects = document.querySelectorAll('.photo-rect');
  rects.forEach(el => el.classList.remove('overlap-warning', 'out-of-bounds-warning'));

  const rectById = {};
  rects.forEach(el => { rectById[parseInt(el.dataset.id, 10)] = el; });

  let overlapPairs = 0;
  let outOfBoundsCount = 0;

  for (let i = 0; i < placedPhotos.length; i++) {
    const p = placedPhotos[i];
    const outside = p.x < 0 || p.y < 0 || p.x + p.w > currentCanvas.w || p.y + p.h > currentCanvas.h;
    if (outside) {
      outOfBoundsCount++;
      if (rectById[p.id]) rectById[p.id].classList.add('out-of-bounds-warning');
    }
  }

  for (let i = 0; i < placedPhotos.length; i++) {
    for (let j = i + 1; j < placedPhotos.length; j++) {
      const a = placedPhotos[i], b = placedPhotos[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        overlapPairs++;
        const elA = rectById[a.id];
        const elB = rectById[b.id];
        if (elA) elA.classList.add('overlap-warning');
        if (elB) elB.classList.add('overlap-warning');
      }
    }
  }

  if (placedPhotos.length === 0) {
    setLayoutFeedback('No layout generated yet.', 'info');
  } else if (outOfBoundsCount > 0) {
    setLayoutFeedback(`${outOfBoundsCount} photo${outOfBoundsCount > 1 ? 's are' : ' is'} outside canvas bounds. Resize or move highlighted items.`, 'warn');
  } else if (overlapPairs > 0) {
    setLayoutFeedback(`${overlapPairs} overlap${overlapPairs > 1 ? 's' : ''} detected. Highlighted photos will collide in print.`, 'warn');
  } else {
    setLayoutFeedback('No overlaps. All photos fit within the canvas.', 'success');
  }
}
