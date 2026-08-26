import fs from "node:fs/promises";
import sharp from "sharp";
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  setCharacterSqueeze
} from "pdf-lib";
import { sanitizeFileName } from "../../shared/naming.js";
import { marginsForOrientation } from "../../shared/marginPolicy.js";
import { fullPlanReconstructionOk, selectedSlices } from "./jobService.js";

const PT_PER_INCH = 72;
const CM_PER_INCH = 2.54;
const SIZE_TOLERANCE_PT = 0.02;

export async function exportPdfJob(job, { dialog, resolveOutputPath }) {
  if (!job?.source?.filePath || !job?.outputDirectory) throw new Error("Origem e pasta de saída são obrigatórias.");
  if (!fullPlanReconstructionOk(job)) throw new Error("A reconstrução matemática do plano falhou antes da exportação PDF.");

  const slices = selectedSlices(job);
  const results = [];
  const warnings = [];
  const sourceIsPdf = String(job.source.format || "").toLowerCase() === "pdf" || job.source.engine === "pdf" || /\.pdf$/i.test(job.source.filePath);
  if (!sourceIsPdf) warnings.push("PDF gerado a partir de arte raster: pixels são preservados sem redimensionamento, mas o contêiner PDF pode não preservar o perfil ICC original.");

  const sourceBytes = sourceIsPdf ? await fs.readFile(job.source.filePath) : null;
  const sourcePdf = sourceIsPdf ? await PDFDocument.load(sourceBytes, { updateMetadata: false }) : null;
  const sourcePage = sourceIsPdf ? sourcePdf.getPage(Math.max(0, (job.source.pageNumber || 1) - 1)) : null;
  const pageSize = sourceIsPdf ? sourcePage.getSize() : null;
  const sourceDpi = Number(job.source.dpi);
  if (!sourceIsPdf && !(sourceDpi > 0)) throw new Error("DPI original é obrigatório para gerar PDF a partir de imagem raster.");

  for (const slice of slices) {
    const geometry = sourceIsPdf ? pdfGeometry(job, slice, pageSize) : rasterGeometry(job, slice, sourceDpi);
    const limitPt = cmToPt(job.fabric.maxPrintableWidthCm);
    const finalLimitedPt = job.orientation === "horizontal" ? geometry.finalHeightPt : geometry.finalWidthPt;
    if (finalLimitedPt > limitPt + SIZE_TOLERANCE_PT) throw new Error(`Faixa ${slice.index} excederia o limite do tecido em PDF.`);

    const out = await PDFDocument.create();
    const page = out.addPage([geometry.finalWidthPt, geometry.finalHeightPt]);
    drawMargins(page, geometry, job.margin);

    if (sourceIsPdf) {
      const embedded = await out.embedPage(sourcePage, geometry.sourceBoundingBox);
      page.drawPage(embedded, { x: geometry.marginLeftPt, y: geometry.marginBottomPt, width: geometry.contentWidthPt, height: geometry.contentHeightPt });
    } else {
      let crop = sharp(job.source.filePath, { limitInputPixels: false }).extract(geometry.extract);
      if (typeof crop.keepIccProfile === "function") crop = crop.keepIccProfile();
      const png = await crop.png().toBuffer();
      const embedded = await out.embedPng(png);
      page.drawImage(embedded, { x: geometry.marginLeftPt, y: geometry.marginBottomPt, width: geometry.contentWidthPt, height: geometry.contentHeightPt });
    }

    await drawPdfTechnicalText(out, page, geometry, slice, job);
    out.setTitle(String(job.baseName || "AUTOCUT"));
    out.setCreator("AUTOCUT");
    out.setProducer("AUTOCUT / pdf-lib");

    const bytes = await out.save({ useObjectStreams: false });
    const baseName = sanitizeFileName(slice.fileName || `${job.baseName}_FAIXA_${slice.index}-DE-${job.slices.length}`);
    const outputPath = await resolveOutputPath({ dialog, folder: job.outputDirectory, baseName, extension: "pdf", policy: job.output?.conflict || "version" });
    if (!outputPath) {
      results.push({ index: slice.index, skipped: true });
      continue;
    }

    await fs.writeFile(outputPath, bytes);
    const saved = await PDFDocument.load(await fs.readFile(outputPath), { updateMetadata: false });
    const savedPage = saved.getPage(0);
    const savedSize = savedPage.getSize();
    const actualLimitedPt = job.orientation === "horizontal" ? savedSize.height : savedSize.width;
    const validation = {
      pageCountOk: saved.getPageCount() === 1,
      dimensionsOk: Math.abs(savedSize.width - geometry.finalWidthPt) <= SIZE_TOLERANCE_PT && Math.abs(savedSize.height - geometry.finalHeightPt) <= SIZE_TOLERANCE_PT,
      limitOk: actualLimitedPt <= limitPt + SIZE_TOLERANCE_PT,
      vectorContainerOk: true,
      exclusiveMarginPairOk: geometry.placement === "lateral"
        ? geometry.marginTopPt === 0 && geometry.marginBottomPt === 0
        : geometry.marginLeftPt === 0 && geometry.marginRightPt === 0
    };
    validation.approved = Object.values(validation).every(Boolean);
    results.push({ index: slice.index, filePath: outputPath, widthPt: savedSize.width, heightPt: savedSize.height, validation });
  }

  const generated = results.filter((result) => !result.skipped);
  const approved = generated.length > 0 && generated.every((result) => result.validation?.approved);
  return {
    ok: approved,
    status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO",
    mode: slices.length !== job.slices.length ? "REPRINT" : "FULL",
    reconstructionOk: true,
    filesValidated: generated.filter((result) => result.validation?.approved).length,
    filesGenerated: generated.length,
    requestedSlices: slices.map((slice) => slice.index),
    results,
    warnings
  };
}

function pdfGeometry(job, slice, pageSize) {
  const { width: widthPt, height: heightPt } = pageSize;
  const margins = marginPoints(job.margin, job.orientation);
  let left, right, bottom, top, contentWidthPt, contentHeightPt;
  if (job.orientation === "horizontal") {
    const start = slice.startPx / job.source.heightPx;
    const end = slice.endPx / job.source.heightPx;
    left = 0; right = widthPt; top = heightPt - start * heightPt; bottom = heightPt - end * heightPt;
    contentWidthPt = widthPt; contentHeightPt = top - bottom;
  } else {
    const start = slice.startPx / job.source.widthPx;
    const end = slice.endPx / job.source.widthPx;
    left = start * widthPt; right = end * widthPt; bottom = 0; top = heightPt;
    contentWidthPt = right - left; contentHeightPt = heightPt;
  }
  return geometryWithMargins({ sourceBoundingBox: { left, right, bottom, top }, contentWidthPt, contentHeightPt }, margins);
}

function rasterGeometry(job, slice, dpi) {
  const margins = marginPoints(job.margin, job.orientation);
  const extract = job.orientation === "horizontal"
    ? { left: 0, top: slice.startPx, width: job.source.widthPx, height: slice.usefulPx }
    : { left: slice.startPx, top: 0, width: slice.usefulPx, height: job.source.heightPx };
  const contentWidthPt = extract.width / dpi * PT_PER_INCH;
  const contentHeightPt = extract.height / dpi * PT_PER_INCH;
  return geometryWithMargins({ extract, contentWidthPt, contentHeightPt }, margins);
}

function geometryWithMargins(base, margins) {
  return {
    ...base,
    placement: margins.placement,
    finalWidthPt: base.contentWidthPt + margins.left + margins.right,
    finalHeightPt: base.contentHeightPt + margins.top + margins.bottom,
    marginLeftPt: margins.left,
    marginRightPt: margins.right,
    marginTopPt: margins.top,
    marginBottomPt: margins.bottom
  };
}

function marginPoints(margin, orientation) {
  const virtualDpi = 7200;
  const m = marginsForOrientation(margin, orientation, virtualDpi);
  const toPt = (px) => px / virtualDpi * PT_PER_INCH;
  return { placement: m.placement, top: toPt(m.topPx), right: toPt(m.rightPx), bottom: toPt(m.bottomPx), left: toPt(m.leftPx) };
}

function cmToPt(cm) {
  return Number(cm) / CM_PER_INCH * PT_PER_INCH;
}

function drawMargins(page, g, margin) {
  if (margin?.transparent || margin?.enabled === false) return;
  const color = hexRgb(margin?.color || "#ffffff");
  const opacity = Number.isFinite(Number(margin?.opacity)) ? Math.max(0, Math.min(1, Number(margin.opacity))) : 1;
  if (g.marginTopPt) page.drawRectangle({ x: 0, y: g.finalHeightPt - g.marginTopPt, width: g.finalWidthPt, height: g.marginTopPt, color, opacity });
  if (g.marginBottomPt) page.drawRectangle({ x: 0, y: 0, width: g.finalWidthPt, height: g.marginBottomPt, color, opacity });
  if (g.marginLeftPt) page.drawRectangle({ x: 0, y: g.marginBottomPt, width: g.marginLeftPt, height: g.contentHeightPt, color, opacity });
  if (g.marginRightPt) page.drawRectangle({ x: g.finalWidthPt - g.marginRightPt, y: g.marginBottomPt, width: g.marginRightPt, height: g.contentHeightPt, color, opacity });
}

async function drawPdfTechnicalText(doc, page, g, slice, job) {
  if (!job.identification?.enabled && !Object.values(job.nameSides || {}).some(Boolean)) return;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = hexRgb(job.identification?.color || "#111111");
  const size = cmToPt(Math.max(0.1, Number(job.identification?.sizeCm) || 2));
  const edge = cmToPt(Math.max(0, Number(job.identification?.edgeDistanceCm) || 0.18));
  const stripPad = cmToPt(0.08);
  const before = slice.seam?.labels?.before;
  const after = slice.seam?.labels?.after;

  if (job.identification?.enabled) {
    if (job.orientation === "horizontal" && g.placement === "lateral") {
      if (before) pairHorizontalLateral(page, font, color, before, "before", g, size, edge, stripPad);
      if (after) pairHorizontalLateral(page, font, color, after, "after", g, size, edge, stripPad);
    } else if (job.orientation === "horizontal") {
      if (before) pairHorizontalTopBottom(page, font, color, before, "before", g, size, edge, stripPad);
      if (after) pairHorizontalTopBottom(page, font, color, after, "after", g, size, edge, stripPad);
    } else if (g.placement === "lateral") {
      if (before) pairVerticalLateral(page, font, color, before, "before", g, size, edge, stripPad);
      if (after) pairVerticalLateral(page, font, color, after, "after", g, size, edge, stripPad);
    } else {
      if (before) pairVerticalTopBottom(page, font, color, before, "before", g, size, edge, stripPad);
      if (after) pairVerticalTopBottom(page, font, color, after, "after", g, size, edge, stripPad);
    }
  }

  const name = String(job.baseName || "").toUpperCase();
  if (!name) return;
  const nameSize = size * 0.55;
  if (g.placement === "lateral") {
    if (job.nameSides?.left && g.marginLeftPt) drawCompressed(page, font, color, name, g.marginLeftPt / 2, g.finalHeightPt / 2, nameSize, Math.max(1, g.finalHeightPt - edge * 2), -90, "center");
    if (job.nameSides?.right && g.marginRightPt) drawCompressed(page, font, color, name, g.finalWidthPt - g.marginRightPt / 2, g.finalHeightPt / 2, nameSize, Math.max(1, g.finalHeightPt - edge * 2), 90, "center");
  } else {
    if (job.nameSides?.top && g.marginTopPt) drawCompressed(page, font, color, name, g.finalWidthPt / 2, g.finalHeightPt - g.marginTopPt / 2, nameSize, Math.max(1, g.finalWidthPt - edge * 2), 0, "center");
    if (job.nameSides?.bottom && g.marginBottomPt) drawCompressed(page, font, color, name, g.finalWidthPt / 2, g.marginBottomPt / 2, nameSize, Math.max(1, g.finalWidthPt - edge * 2), 0, "center");
  }
}

function pairHorizontalLateral(page, font, color, labels, edgeName, g, size, edge, stripPad) {
  const y = edgeName === "before" ? g.finalHeightPt - edge - size : edge;
  drawCompressed(page, font, color, labels[0], g.marginLeftPt / 2, y + size / 2, size, Math.max(1, g.marginLeftPt - stripPad * 2), 0, "center");
  drawCompressed(page, font, color, labels[1], g.finalWidthPt - g.marginRightPt / 2, y + size / 2, size, Math.max(1, g.marginRightPt - stripPad * 2), 0, "center");
}

function pairHorizontalTopBottom(page, font, color, labels, edgeName, g, size, edge, stripPad) {
  const top = edgeName === "before";
  const y = top ? g.finalHeightPt - g.marginTopPt / 2 : g.marginBottomPt / 2;
  const max = Math.max(1, (top ? g.marginTopPt : g.marginBottomPt) - stripPad * 2);
  drawCompressed(page, font, color, labels[0], edge + size / 2, y, size, max, 90, "center");
  drawCompressed(page, font, color, labels[1], g.finalWidthPt - edge - size / 2, y, size, max, 90, "center");
}

function pairVerticalLateral(page, font, color, labels, edgeName, g, size, edge, stripPad) {
  const left = edgeName === "before";
  const x = left ? g.marginLeftPt / 2 : g.finalWidthPt - g.marginRightPt / 2;
  const max = Math.max(1, (left ? g.marginLeftPt : g.marginRightPt) - stripPad * 2);
  drawCompressed(page, font, color, labels[0], x, g.finalHeightPt - edge - size / 2, size, max, 0, "center");
  drawCompressed(page, font, color, labels[1], x, edge + size / 2, size, max, 0, "center");
}

function pairVerticalTopBottom(page, font, color, labels, edgeName, g, size, edge, stripPad) {
  const x = edgeName === "before" ? edge + size / 2 : g.finalWidthPt - edge - size / 2;
  drawCompressed(page, font, color, labels[0], x, g.finalHeightPt - g.marginTopPt / 2, size, Math.max(1, g.marginTopPt - stripPad * 2), 90, "center");
  drawCompressed(page, font, color, labels[1], x, g.marginBottomPt / 2, size, Math.max(1, g.marginBottomPt - stripPad * 2), 90, "center");
}

function drawCompressed(page, font, color, text, cx, cy, size, maxAdvance, rotation = 0, anchor = "center") {
  const naturalWidth = Math.max(0.01, font.widthOfTextAtSize(text, size));
  const squeeze = Math.max(1, Math.min(100, maxAdvance / naturalWidth * 100));
  const shownWidth = naturalWidth * squeeze / 100;
  let x = cx;
  let y = cy - size * 0.35;
  if (!rotation) {
    if (anchor === "center") x -= shownWidth / 2;
  } else {
    x = cx;
    y = cy;
  }
  page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeeze));
  page.drawText(text, { x, y, size, font, color, rotate: degrees(rotation) });
  page.pushOperators(popGraphicsState());
}

function hexRgb(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? String(hex).slice(1) : "ffffff";
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}
