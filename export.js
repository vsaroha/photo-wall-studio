const PAPER_SIZES = {
  letter: { w: 8.5, h: 11, label: 'Letter' },
  a4: { w: 8.27, h: 11.69, label: 'A4' }
};
const FRAME_WOOD_RATIO = 0.13;
const FRAME_MAT_RATIO = 0.08;
const FRAME_IMAGE_CACHE = new Map();

function sanitizeFileName(raw) {
  const cleaned = (raw || 'photo-wall-studio-layout')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9\-_ ]+/g, '')
    .trim();
  return cleaned || 'photo-wall-studio-layout';
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

function getMeasurementScale(pageW, pageH) {
  const longEdge = Math.max(pageW, pageH);
  return clamp(longEdge / 12, 1, 6);
}

function drawMeasurementChip(doc, text, cx, cy, pageW, pageH, scaleFactor, fontPt) {
  doc.setFontSize(fontPt);
  const textW = doc.getTextWidth(text);
  const padX = 0.055 * scaleFactor;
  const padY = 0.026 * scaleFactor;
  const chipW = textW + padX * 2;
  const chipH = (fontPt / 72) * 1.15 + padY * 2;
  const x = clamp(cx - chipW / 2, 0.1, pageW - chipW - 0.1);
  const y = clamp(cy - chipH / 2, 0.1, pageH - chipH - 0.1);
  const radius = Math.min(chipH * 0.3, 0.08 * scaleFactor);

  doc.setLineWidth(Math.max(0.0025, 0.0035 * scaleFactor));
  doc.setDrawColor(175, 186, 198);
  doc.setFillColor(246, 249, 252);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(x, y, chipW, chipH, radius, radius, 'FD');
  } else {
    doc.rect(x, y, chipW, chipH, 'FD');
  }

  doc.setTextColor(56, 73, 93);
  doc.text(text, x + chipW / 2, y + chipH / 2, { align: 'center', baseline: 'middle' });
}

function drawGapAnnotationsPDF(doc, gapAnnotations, scale, offsetX, offsetY, pageW, pageH) {
  if (!gapAnnotations || gapAnnotations.length === 0) return;

  const scaleFactor = getMeasurementScale(pageW, pageH);
  const fontPt = Math.max(9, Math.min(42, 12 + scaleFactor * 5));
  doc.setDrawColor(56, 86, 122);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([0.04 * scaleFactor, 0.026 * scaleFactor], 0);
  }

  gapAnnotations.forEach((gap) => {
    const x1 = offsetX + gap.x1 * scale;
    const y1 = offsetY + gap.y1 * scale;
    const x2 = offsetX + gap.x2 * scale;
    const y2 = offsetY + gap.y2 * scale;
    doc.setLineWidth(Math.max(0.004, 0.006 * scaleFactor));
    doc.line(x1, y1, x2, y2);

    const label = `${toDisplay(gap.gap)} ${unitSuffix()}`;
    const lx = clamp(offsetX + gap.labelX * scale, 0.12, pageW - 0.12);
    const ly = clamp(offsetY + gap.labelY * scale, 0.12, pageH - 0.18);
    drawMeasurementChip(doc, label, lx, ly, pageW, pageH, scaleFactor, fontPt);
  });

  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([], 0);
  }
}

function drawCanvasDimensionsPDF(doc, canvas, pageW, pageH, offsetX, offsetY, layoutW, layoutH) {
  const scaleFactor = getMeasurementScale(pageW, pageH);
  const fontPt = Math.max(10, Math.min(48, 13 + scaleFactor * 6));
  const topLabel = `${toDisplay(canvas.w)} ${unitSuffix()}`;
  const leftLabel = `${toDisplay(canvas.h)} ${unitSuffix()}`;
  const offset = 0.16 * scaleFactor;

  drawMeasurementChip(
    doc,
    topLabel,
    offsetX + layoutW / 2,
    offsetY - offset,
    pageW,
    pageH,
    scaleFactor,
    fontPt
  );
  drawMeasurementChip(
    doc,
    leftLabel,
    offsetX - offset,
    offsetY + layoutH / 2,
    pageW,
    pageH,
    scaleFactor,
    fontPt
  );
}

function fitTextFontPt(doc, text, targetWidthIn, targetHeightIn, preferredPt, minPt) {
  let pt = Math.max(minPt, preferredPt);
  const maxWidth = Math.max(0.12, targetWidthIn);
  const maxHeightPt = Math.max(minPt, targetHeightIn * 72);
  if (pt > maxHeightPt) pt = maxHeightPt;
  doc.setFontSize(pt);
  while (pt > minPt && doc.getTextWidth(text) > maxWidth) {
    pt -= 0.5;
    doc.setFontSize(pt);
  }
  return pt;
}

function mixChannel(base, next, ratio) {
  return Math.round(base + (next - base) * ratio);
}

function rgbToCss(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function lightenColor(rgb, amount) {
  return {
    r: mixChannel(rgb.r, 255, amount),
    g: mixChannel(rgb.g, 255, amount),
    b: mixChannel(rgb.b, 255, amount)
  };
}

function darkenColor(rgb, amount) {
  return {
    r: mixChannel(rgb.r, 0, amount),
    g: mixChannel(rgb.g, 0, amount),
    b: mixChannel(rgb.b, 0, amount)
  };
}

function getFrameInsetsInches(w, h) {
  const shortEdge = Math.min(w, h);
  let wood = clamp(shortEdge * FRAME_WOOD_RATIO, 0.05, 0.32);
  let mat = clamp(shortEdge * FRAME_MAT_RATIO, 0.03, 0.2);
  const maxInset = Math.max(0.02, shortEdge / 2 - 0.01);
  if (wood + mat > maxInset) {
    const ratio = maxInset / (wood + mat);
    wood *= ratio;
    mat *= ratio;
  }
  return {
    wood,
    mat,
    inset: wood + mat
  };
}

function getFrameAssetKey(w, h, colorHex) {
  const ratioBucket = Math.round((w / Math.max(0.01, h)) * 40) / 40;
  const rgb = hexToRgb(colorHex || '#8f6e46');
  const toneBucket = `${Math.round(rgb.r / 16)}-${Math.round(rgb.g / 16)}-${Math.round(rgb.b / 16)}`;
  return `${ratioBucket}|${toneBucket}`;
}

function getFrameImageAsset(w, h, colorHex) {
  const key = getFrameAssetKey(w, h, colorHex);
  if (FRAME_IMAGE_CACHE.has(key)) return FRAME_IMAGE_CACHE.get(key);

  const ratio = w / Math.max(0.01, h);
  const maxEdge = 920;
  let canvasW = maxEdge;
  let canvasH = Math.max(260, Math.round(maxEdge / Math.max(0.24, ratio)));
  if (ratio < 1) {
    canvasH = maxEdge;
    canvasW = Math.max(260, Math.round(maxEdge * ratio));
  }

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = canvasW;
  frameCanvas.height = canvasH;
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) return null;

  const sourceRgb = hexToRgb(colorHex || '#8f6e46');
  const woodBase = {
    r: clamp(Math.round(85 + sourceRgb.r * 0.22), 70, 165),
    g: clamp(Math.round(56 + sourceRgb.g * 0.15), 48, 132),
    b: clamp(Math.round(34 + sourceRgb.b * 0.1), 28, 92)
  };
  const woodDark = darkenColor(woodBase, 0.28);
  const woodLight = lightenColor(woodBase, 0.22);
  const shortPx = Math.min(canvasW, canvasH);
  const woodPx = Math.max(18, Math.round(shortPx * FRAME_WOOD_RATIO));
  const matPx = Math.max(10, Math.round(shortPx * FRAME_MAT_RATIO));

  const woodGradient = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  woodGradient.addColorStop(0, rgbToCss(woodLight));
  woodGradient.addColorStop(0.46, rgbToCss(woodBase));
  woodGradient.addColorStop(1, rgbToCss(woodDark));
  ctx.fillStyle = woodGradient;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 150; i += 1) {
    const y = (i / 149) * canvasH;
    const wobble = Math.sin(i * 0.43) * (shortPx * 0.01);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(45,23,8,0.28)';
    ctx.lineWidth = Math.max(1, shortPx * 0.003 + ((i % 5) * 0.12));
    ctx.beginPath();
    ctx.moveTo(0, y + wobble);
    ctx.bezierCurveTo(canvasW * 0.32, y - wobble, canvasW * 0.68, y + wobble * 1.4, canvasW, y - wobble * 0.4);
    ctx.stroke();
  }
  ctx.restore();

  const bevelOuter = Math.max(2, Math.round(woodPx * 0.2));
  ctx.strokeStyle = 'rgba(255,245,232,0.45)';
  ctx.lineWidth = bevelOuter;
  ctx.strokeRect(bevelOuter / 2, bevelOuter / 2, canvasW - bevelOuter, canvasH - bevelOuter);
  ctx.strokeStyle = 'rgba(34,16,6,0.48)';
  ctx.lineWidth = Math.max(1.5, bevelOuter * 0.75);
  ctx.strokeRect(woodPx * 0.36, woodPx * 0.36, canvasW - woodPx * 0.72, canvasH - woodPx * 0.72);

  const matX = woodPx;
  const matY = woodPx;
  const matW = canvasW - woodPx * 2;
  const matH = canvasH - woodPx * 2;
  const matGradient = ctx.createLinearGradient(matX, matY, matX, matY + matH);
  matGradient.addColorStop(0, 'rgb(247, 244, 238)');
  matGradient.addColorStop(1, 'rgb(234, 228, 219)');
  ctx.fillStyle = matGradient;
  ctx.fillRect(matX, matY, matW, matH);
  ctx.strokeStyle = 'rgba(89,78,63,0.25)';
  ctx.lineWidth = Math.max(1, shortPx * 0.006);
  ctx.strokeRect(matX, matY, matW, matH);

  const openingX = matX + matPx;
  const openingY = matY + matPx;
  const openingW = Math.max(8, matW - matPx * 2);
  const openingH = Math.max(8, matH - matPx * 2);
  ctx.fillStyle = 'rgb(252, 251, 248)';
  ctx.fillRect(openingX, openingY, openingW, openingH);
  ctx.strokeStyle = 'rgba(64, 64, 64, 0.18)';
  ctx.lineWidth = Math.max(1, shortPx * 0.004);
  ctx.strokeRect(openingX, openingY, openingW, openingH);

  ctx.strokeStyle = 'rgba(112, 122, 134, 0.22)';
  ctx.lineWidth = Math.max(1, shortPx * 0.003);
  ctx.beginPath();
  ctx.moveTo(openingX + openingW * 0.08, openingY + openingH * 0.08);
  ctx.lineTo(openingX + openingW * 0.92, openingY + openingH * 0.92);
  ctx.moveTo(openingX + openingW * 0.92, openingY + openingH * 0.08);
  ctx.lineTo(openingX + openingW * 0.08, openingY + openingH * 0.92);
  ctx.stroke();

  const asset = {
    alias: `frame-${key.replace(/[^a-z0-9]+/gi, '-')}`,
    dataUrl: frameCanvas.toDataURL('image/png')
  };
  FRAME_IMAGE_CACHE.set(key, asset);
  return asset;
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

  const baseLabelFont = Math.max(10, Math.min(34, 11 + getMeasurementScale(pageW, pageH) * 3.2));
  doc.setFont('helvetica', 'bold');
  placedPhotos.forEach(p => {
    const x = offsetX + p.x * scale;
    const y = offsetY + p.y * scale;
    const w = p.w * scale;
    const h = p.h * scale;

    const frameAsset = getFrameImageAsset(p.w, p.h, p.color);
    if (frameAsset) {
      doc.addImage(frameAsset.dataUrl, 'PNG', x, y, w, h, frameAsset.alias, 'FAST');
      doc.setDrawColor(82, 62, 44);
      doc.setLineWidth(Math.max(0.004, 0.007 * scale));
      doc.rect(x, y, w, h);
    } else {
      const rgb = hexToRgb(p.color);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.setDrawColor(80);
      doc.setLineWidth(Math.max(0.006, 0.01 * scale));
      doc.rect(x, y, w, h, 'FD');
    }

    if (options.includeLabels) {
      const sizeLine = `${toDisplay(p.w)}×${toDisplay(p.h)}`;
      const unitLine = unitSuffix();
      const insets = getFrameInsetsInches(w, h);
      const labelW = Math.max(0.12, w - insets.inset * 2);
      const labelH = Math.max(0.1, h - insets.inset * 2);
      const labelX = x + (w - labelW) / 2;
      const labelY = y + (h - labelH) / 2;
      if (labelW >= 0.64 && labelH >= 0.32) {
        const sizePt = fitTextFontPt(doc, sizeLine, labelW * 0.78, labelH * 0.26, baseLabelFont, 8);
        const unitPt = fitTextFontPt(doc, unitLine, labelW * 0.64, labelH * 0.18, Math.max(7, sizePt * 0.72), 6.5);
        const offset = (sizePt / 72) * 0.36;
        doc.setTextColor(72, 74, 78);
        doc.setFontSize(sizePt);
        doc.text(sizeLine, labelX + labelW / 2, labelY + labelH / 2 - offset, { align: 'center', baseline: 'middle' });
        doc.setFontSize(unitPt);
        doc.text(unitLine, labelX + labelW / 2, labelY + labelH / 2 + offset, { align: 'center', baseline: 'middle' });
      } else {
        const fallbackLabel = `${sizeLine} ${unitLine}`;
        const fallbackPt = fitTextFontPt(doc, fallbackLabel, Math.max(0.5, w * 0.95), 0.18, Math.max(8, baseLabelFont * 0.72), 7);
        doc.setTextColor(56, 56, 56);
        doc.setFontSize(fallbackPt);
        const yPos = Math.max(margin + 0.1, y - 0.04);
        doc.text(fallbackLabel, x + w / 2, yPos, { align: 'center' });
      }
    }
  });
  doc.setFont('helvetica', 'normal');

  const gapAnnotations = (typeof computeGapAnnotations === 'function')
    ? computeGapAnnotations(placedPhotos, canvas)
    : [];
  drawGapAnnotationsPDF(doc, gapAnnotations, scale, offsetX, offsetY, pageW, pageH);
  drawCanvasDimensionsPDF(doc, canvas, pageW, pageH, offsetX, offsetY, layoutW, layoutH);

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
