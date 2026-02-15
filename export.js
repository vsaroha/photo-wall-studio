const PAPER_SIZES = {
  letter: { w: 8.5, h: 11, label: 'Letter' },
  a4: { w: 8.27, h: 11.69, label: 'A4' }
};

function sanitizeFileName(raw) {
  const cleaned = (raw || 'collage-layout')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9\-_ ]+/g, '')
    .trim();
  return cleaned || 'collage-layout';
}

function getExportOptions() {
  return {
    fileName: sanitizeFileName(document.getElementById('exportName').value),
    format: document.getElementById('exportFormat').value,
    orientation: document.getElementById('exportOrientation').value,
    includeLabels: document.getElementById('exportLabels').checked,
    includeLegend: document.getElementById('exportLegend').checked
  };
}

function getPageDims(canvas, options) {
  let pageW = canvas.w;
  let pageH = canvas.h;
  let pageLabel = 'Canvas Size';

  if (options.format !== 'auto' && PAPER_SIZES[options.format]) {
    const paper = PAPER_SIZES[options.format];
    pageW = paper.w;
    pageH = paper.h;
    pageLabel = paper.label;
  }

  if (options.orientation === 'landscape' && pageH > pageW) {
    [pageW, pageH] = [pageH, pageW];
  } else if (options.orientation === 'portrait' && pageW > pageH) {
    [pageW, pageH] = [pageH, pageW];
  } else if (options.orientation === 'auto' && canvas.w > canvas.h && pageH > pageW) {
    [pageW, pageH] = [pageH, pageW];
  }

  return { pageW, pageH, pageLabel };
}

function buildSizeSummary() {
  const counts = new Map();
  placedPhotos.forEach((p) => {
    const key = `${toDisplay(p.w)}×${toDisplay(p.h)} ${unitSuffix()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([size, qty]) => `${size} × ${qty}`)
    .join(', ');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawGapAnnotationsPDF(doc, gapAnnotations, scale, offsetX, offsetY, pageW, pageH) {
  if (!gapAnnotations || gapAnnotations.length === 0) return;

  doc.setDrawColor(70);
  doc.setTextColor(50);
  doc.setFontSize(Math.max(5, Math.min(7.2, 5.8 * scale + 0.5)));
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([0.03, 0.02], 0);
  }

  gapAnnotations.forEach((gap) => {
    const x1 = offsetX + gap.x1 * scale;
    const y1 = offsetY + gap.y1 * scale;
    const x2 = offsetX + gap.x2 * scale;
    const y2 = offsetY + gap.y2 * scale;
    doc.setLineWidth(Math.max(0.004, 0.006 * scale));
    doc.line(x1, y1, x2, y2);

    const label = `${toDisplay(gap.gap)} ${unitSuffix()}`;
    const lx = clamp(offsetX + gap.labelX * scale, 0.12, pageW - 0.12);
    const ly = clamp(offsetY + gap.labelY * scale, 0.12, pageH - 0.18);
    doc.text(label, lx, ly, { align: 'center' });
  });

  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([], 0);
  }
}

// ── PDF Export ──
function exportPDF() {
  if (placedPhotos.length === 0) { showToast('Generate a design first'); return; }

  const canvas = currentCanvas;
  const spacing = getSpacing();
  const options = getExportOptions();
  const { pageW, pageH, pageLabel } = getPageDims(canvas, options);
  const orientation = pageW > pageH ? 'landscape' : 'portrait';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation, unit: 'in', format: [pageW, pageH] });

  const margin = options.format === 'auto' ? 0 : 0.35;
  const footerH = options.includeLegend ? 0.28 : 0;
  const drawW = Math.max(0.5, pageW - margin * 2);
  const drawH = Math.max(0.5, pageH - margin * 2 - footerH);
  const scale = Math.min(drawW / canvas.w, drawH / canvas.h);

  const layoutW = canvas.w * scale;
  const layoutH = canvas.h * scale;
  const offsetX = margin + (drawW - layoutW) / 2;
  const offsetY = margin + (drawH - layoutH) / 2;

  doc.setDrawColor(180);
  doc.setLineWidth(Math.max(0.006, 0.01 * scale));
  doc.rect(offsetX, offsetY, layoutW, layoutH);

  const labelFont = Math.max(5.5, Math.min(9, 7 * scale + 1));
  placedPhotos.forEach(p => {
    const rgb = hexToRgb(p.color);
    const x = offsetX + p.x * scale;
    const y = offsetY + p.y * scale;
    const w = p.w * scale;
    const h = p.h * scale;

    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.setDrawColor(80);
    doc.setLineWidth(Math.max(0.006, 0.01 * scale));
    doc.rect(x, y, w, h, 'FD');

    if (options.includeLabels) {
      const label = `${toDisplay(p.w)}×${toDisplay(p.h)} ${unitSuffix()}`;
      doc.setFontSize(labelFont);
      if (w >= 0.7 && h >= 0.3) {
        doc.setTextColor(255, 255, 255);
        doc.text(label, x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
      } else {
        doc.setTextColor(40);
        const yPos = Math.max(margin + 0.1, y - 0.04);
        doc.text(label, x + w / 2, yPos, { align: 'center' });
      }
    }
  });

  const gapAnnotations = (typeof computeGapAnnotations === 'function')
    ? computeGapAnnotations(placedPhotos, canvas)
    : [];
  drawGapAnnotationsPDF(doc, gapAnnotations, scale, offsetX, offsetY, pageW, pageH);

  if (options.includeLegend) {
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    const sizeSummary = buildSizeSummary();
    const info = `Paper: ${pageLabel} | Canvas: ${toDisplay(canvas.w)}×${toDisplay(canvas.h)} ${unitSuffix()} | Spacing: ${toDisplay(spacing)} ${unitSuffix()} | Photos: ${placedPhotos.length} | Sizes: ${sizeSummary}`;
    doc.text(info, pageW / 2, pageH - 0.14, { align: 'center' });
  }

  doc.save(`${options.fileName}.pdf`);
  showToast(`Exported ${options.fileName}.pdf (${pageLabel})`);
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
document.getElementById('artDirection').addEventListener('change', () => { saveState(); autoRegenerate(); });
document.getElementById('gridSize').addEventListener('change', () => {
  saveState();
  if (placedPhotos.length > 0) renderCanvas();
});
document.getElementById('snapToGrid').addEventListener('change', saveState);
document.getElementById('showGrid').addEventListener('change', () => {
  saveState();
  if (placedPhotos.length > 0) renderCanvas();
});
['exportName', 'exportFormat', 'exportOrientation', 'exportLabels', 'exportLegend'].forEach(id => {
  document.getElementById(id).addEventListener('change', saveState);
});
const exportSettings = document.getElementById('exportSettings');
if (exportSettings) {
  exportSettings.addEventListener('toggle', () => {
    if (placedPhotos.length > 0) renderCanvas();
  });
}

// ── Init ──
loadState();
if (photoEntries.length > 0) {
  if (placedPhotos.length > 0) {
    renderCanvas(currentCanvas);
  } else {
    runLayout();
  }
} else {
  setLayoutFeedback('No layout generated yet.', 'info');
}
