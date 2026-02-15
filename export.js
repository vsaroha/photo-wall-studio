// ── PDF Export ──
function exportPDF() {
  if (placedPhotos.length === 0) { showToast('Generate a design first'); return; }

  const canvas = currentCanvas;
  const spacing = getSpacing();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: canvas.w > canvas.h ? 'landscape' : 'portrait',
    unit: 'in',
    format: [canvas.w, canvas.h]
  });

  // Draw canvas border
  doc.setDrawColor(180);
  doc.setLineWidth(0.01);
  doc.rect(0, 0, canvas.w, canvas.h);

  // Draw photos
  placedPhotos.forEach(p => {
    const rgb = hexToRgb(p.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.setDrawColor(80);
    doc.setLineWidth(0.01);
    doc.rect(p.x, p.y, p.w, p.h, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const label = `${toDisplay(p.w)}×${toDisplay(p.h)} ${unitSuffix()}`;
    doc.text(label, p.x + p.w / 2, p.y + p.h / 2, { align: 'center', baseline: 'middle' });
  });

  // Footer legend
  doc.setFontSize(6);
  doc.setTextColor(120);
  const info = `Canvas: ${toDisplay(canvas.w)}×${toDisplay(canvas.h)} ${unitSuffix()} | Spacing: ${toDisplay(spacing)} ${unitSuffix()} | Photos: ${placedPhotos.length}`;
  doc.text(info, canvas.w / 2, canvas.h - 0.15, { align: 'center' });

  doc.save('collage-layout.pdf');
  showToast('PDF exported!');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ── Toast ──
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Window resize ──
window.addEventListener('resize', () => { if (placedPhotos.length) renderCanvas(); });

// ── Save settings on change & auto-regenerate ──
['prefRows','prefCols','spacing'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { saveState(); autoRegenerate(); });
});
document.getElementById('layoutStyle').addEventListener('change', () => { saveState(); autoRegenerate(); });

// ── Init ──
loadState();
