import { cmToCeilPx, cmToPx, pxToCm } from "./units.js";
import { labelsForSlice } from "./seams.js";
import { DEFAULT_NAME_TEMPLATE, renderNameTemplate } from "./naming.js";

export function planCutJob({
  widthCm,
  heightCm,
  widthPx: explicitWidthPx,
  heightPx: explicitHeightPx,
  dpi = 300,
  fabric,
  margin,
  orientation = "auto",
  baseName = "ARTE",
  namingTemplate = DEFAULT_NAME_TEMPLATE,
  minimumLastSliceCm = 10,
  balanceCuts = false,
  outputFormat = "PNG",
  pedido = ""
}) {
  const document = normalizeDocument({ widthCm, heightCm, widthPx: explicitWidthPx, heightPx: explicitHeightPx, dpi });
  const maxPrintableWidthPx = cmToPx(fabric.maxPrintableWidthCm, dpi);
  const marginPx = marginPixels(margin, dpi);
  const noCut = evaluateNoCut(document, maxPrintableWidthPx, marginPx);

  if (noCut.fits) {
    const slice = makeNoCutSlice({ document, marginPx, fabric, baseName, namingTemplate, outputFormat, pedido, limitedAxis: noCut.limitedAxis });
    return {
      status: "NO_CUT_NEEDED",
      message: "ESTA ARTE NÃO PRECISA SER DIVIDIDA.",
      document,
      fabric,
      orientation: noCut.limitedAxis === "width" ? "vertical" : "horizontal",
      printOrientation: noCut.printOrientation,
      rotatedForPrint: noCut.rotatedForPrint,
      maxPrintableWidthPx,
      margins: marginPx,
      balanceCuts,
      slices: [slice],
      validation: { approved: true, errors: [], reconstruction: { ok: true, tolerancePx: 0 }, checks: ["A dimensão final preparada cabe no limite físico do tecido."] }
    };
  }

  const candidates = [];
  if (orientation === "auto" || orientation === "horizontal") {
    candidates.push(buildCandidate({ orientation: "horizontal", axisPx: document.heightPx, crossAxisPx: document.widthPx, dpi, fabric, maxPrintableWidthPx, margin, baseName, namingTemplate, minimumLastSliceCm, balanceCuts, outputFormat, pedido }));
  }
  if (orientation === "auto" || orientation === "vertical") {
    candidates.push(buildCandidate({ orientation: "vertical", axisPx: document.widthPx, crossAxisPx: document.heightPx, dpi, fabric, maxPrintableWidthPx, margin, baseName, namingTemplate, minimumLastSliceCm, balanceCuts, outputFormat, pedido }));
  }

  const validCandidates = candidates.filter((candidate) => candidate.validation.approved);
  const selected = chooseBestCandidate(validCandidates.length ? validCandidates : candidates);
  return {
    status: selected.validation.approved ? "CUT_REQUIRED" : "INVALID",
    message: selected.validation.approved ? "CORTE OBRIGATÓRIO." : "NÃO É POSSÍVEL GERAR FAIXAS VÁLIDAS.",
    document,
    fabric,
    maxPrintableWidthPx,
    balanceCuts,
    ...selected
  };
}

export function validateManualCuts({ cutPositionsPx, totalAxisPx, crossAxisPx = 0, dpi, fabric, margin, orientation, linkedMode = false, minimumLastSliceCm = 0 }) {
  const maxPrintableWidthPx = cmToPx(fabric.maxPrintableWidthCm, dpi);
  const margins = marginsForOrientation(margin, orientation, dpi);
  const usefulLimitPx = maxPrintableWidthPx - margins.axisTotalPx;
  if (usefulLimitPx <= 0) throw new Error("As margens consomem toda a largura imprimível.");

  const rawCuts = normalizeCuts(cutPositionsPx, totalAxisPx);
  if (linkedMode) {
    const redistributed = enforceLinkedValidity(rawCuts, totalAxisPx, usefulLimitPx);
    return buildManualValidation({ boundaries: redistributed, totalAxisPx, crossAxisPx, dpi, fabric, margin, orientation, minimumLastSliceCm });
  }
  return buildManualValidation({ boundaries: rawCuts, totalAxisPx, crossAxisPx, dpi, fabric, margin, orientation, minimumLastSliceCm });
}

function normalizeDocument({ widthCm, heightCm, widthPx, heightPx, dpi }) {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("DPI inválido.");
  const resolvedWidthPx = Number.isInteger(widthPx) && widthPx > 0 ? widthPx : cmToPx(assertPositive(widthCm, "largura"), dpi);
  const resolvedHeightPx = Number.isInteger(heightPx) && heightPx > 0 ? heightPx : cmToPx(assertPositive(heightCm, "altura"), dpi);
  return { widthPx: resolvedWidthPx, heightPx: resolvedHeightPx, widthCm: pxToCm(resolvedWidthPx, dpi), heightCm: pxToCm(resolvedHeightPx, dpi), dpi };
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} inválida.`);
  return value;
}

function evaluateNoCut(document, maxPrintableWidthPx, margins) {
  const finalWidthPx = document.widthPx + margins.leftPx + margins.rightPx;
  const finalHeightPx = document.heightPx + margins.topPx + margins.bottomPx;
  if (finalWidthPx <= maxPrintableWidthPx) return { fits: true, limitedAxis: "width", printOrientation: "as-is", rotatedForPrint: false, finalLimitedAxisPx: finalWidthPx };
  if (finalHeightPx <= maxPrintableWidthPx) return { fits: true, limitedAxis: "height", printOrientation: "rotated-90", rotatedForPrint: true, finalLimitedAxisPx: finalHeightPx };
  return { fits: false, limitedAxis: null, printOrientation: "none", rotatedForPrint: false };
}

function makeNoCutSlice({ document, marginPx, fabric, baseName, namingTemplate, outputFormat, pedido, limitedAxis }) {
  const finalWidthPx = document.widthPx + marginPx.leftPx + marginPx.rightPx;
  const finalHeightPx = document.heightPx + marginPx.topPx + marginPx.bottomPx;
  const finalWidthCm = pxToCm(finalWidthPx, document.dpi);
  const finalHeightCm = pxToCm(finalHeightPx, document.dpi);
  const finalLimitedAxisPx = limitedAxis === "width" ? finalWidthPx : finalHeightPx;
  return {
    index: 1, total: 1, startPx: 0,
    endPx: limitedAxis === "width" ? document.widthPx : document.heightPx,
    usefulPx: limitedAxis === "width" ? document.widthPx : document.heightPx,
    usefulCm: pxToCm(limitedAxis === "width" ? document.widthPx : document.heightPx, document.dpi),
    finalLimitedAxisPx, finalLimitedAxisCm: pxToCm(finalLimitedAxisPx, document.dpi), finalWidthPx, finalHeightPx, finalWidthCm, finalHeightCm,
    seam: labelsForSlice(1, 1, limitedAxis === "width" ? "vertical" : "horizontal"),
    fileName: buildFileName({ template: namingTemplate, baseName, index: 1, total: 1, fabric, finalWidthCm, finalHeightCm, outputFormat, dpi: document.dpi, pedido })
  };
}

function buildCandidate(options) {
  const margins = marginsForOrientation(options.margin, options.orientation, options.dpi);
  const usefulLimitPx = options.maxPrintableWidthPx - margins.axisTotalPx;
  if (usefulLimitPx <= 0) return invalidCandidate(options.orientation, margins, "Margens maiores que a largura imprimível do tecido.");

  const sliceCount = Math.ceil(options.axisPx / usefulLimitPx);
  const boundaries = options.balanceCuts
    ? balancedBoundaries(options.axisPx, sliceCount)
    : maximumFillBoundaries(options.axisPx, usefulLimitPx);
  const slices = buildSlices({ ...options, boundaries, margins, sliceCount });
  const reconstruction = validateReconstruction(slices, options.axisPx);
  const errors = [];
  for (const slice of slices) if (slice.finalLimitedAxisPx > options.maxPrintableWidthPx) errors.push(`Faixa ${slice.index} excede o limite final do tecido.`);
  if (!reconstruction.ok) errors.push("Reconstrução da arte falhou.");
  const minimumLastSlicePx = cmToPx(Math.max(0, options.minimumLastSliceCm || 0), options.dpi);
  const lastUsefulPx = slices.at(-1)?.usefulPx ?? 0;
  return {
    orientation: options.orientation,
    usefulLimitPx,
    usefulLimitCm: pxToCm(usefulLimitPx, options.dpi),
    distributionMode: options.balanceCuts ? "balanced" : "maximum-fill",
    margins,
    slices,
    score: { sliceCount, lastBelowDesiredMinimum: sliceCount > 1 && lastUsefulPx < minimumLastSlicePx ? 1 : 0, smallestUsefulPx: Math.min(...slices.map((slice) => slice.usefulPx)), wastePx: (sliceCount * usefulLimitPx) - options.axisPx },
    validation: { approved: errors.length === 0, errors, reconstruction }
  };
}

function buildSlices(options) {
  return options.boundaries.slice(0, -1).map((startPx, index) => {
    const endPx = options.boundaries[index + 1];
    const usefulPx = endPx - startPx;
    const finalAxisPx = usefulPx + options.margins.axisTotalPx;
    const finalCrossAxisPx = options.crossAxisPx + options.margins.crossAxisTotalPx;
    const finalWidthPx = options.orientation === "vertical" ? finalAxisPx : finalCrossAxisPx;
    const finalHeightPx = options.orientation === "horizontal" ? finalAxisPx : finalCrossAxisPx;
    const finalWidthCm = pxToCm(finalWidthPx, options.dpi);
    const finalHeightCm = pxToCm(finalHeightPx, options.dpi);
    return {
      index: index + 1, total: options.sliceCount, startPx, endPx, usefulPx, usefulCm: pxToCm(usefulPx, options.dpi),
      finalLimitedAxisPx: finalAxisPx, finalLimitedAxisCm: pxToCm(finalAxisPx, options.dpi), finalWidthPx, finalHeightPx, finalWidthCm, finalHeightCm,
      seam: labelsForSlice(index + 1, options.sliceCount, options.orientation),
      fileName: buildFileName({ template: options.namingTemplate, baseName: options.baseName, index: index + 1, total: options.sliceCount, fabric: options.fabric, finalWidthCm, finalHeightCm, outputFormat: options.outputFormat, dpi: options.dpi, pedido: options.pedido })
    };
  });
}

function buildFileName({ template, baseName, index, total, fabric, finalWidthCm, finalHeightCm, outputFormat, dpi, pedido }) {
  return renderNameTemplate(template, {
    NOME: baseName, FAIXA: index, TOTAL_FAIXAS: total, FRACAO_FAIXA: `${index}-DE-${total}`, TECIDO: fabric.name,
    LARGURA: finalWidthCm.toFixed(2).replace(".", ","), ALTURA: finalHeightCm.toFixed(2).replace(".", ","),
    TAMANHO: `${finalWidthCm.toFixed(2)}X${finalHeightCm.toFixed(2)}`, FORMATO: String(outputFormat || "PNG").toUpperCase(), DPI: dpi, PEDIDO: pedido || "", DATA: new Date().toISOString().slice(0, 10)
  });
}

function invalidCandidate(orientation, margins, error) {
  return { orientation, margins, slices: [], score: { sliceCount: Number.POSITIVE_INFINITY, lastBelowDesiredMinimum: 1, wastePx: Number.POSITIVE_INFINITY, smallestUsefulPx: 0 }, validation: { approved: false, errors: [error], reconstruction: { ok: false } } };
}

function chooseBestCandidate(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.validation.approved !== b.validation.approved) return a.validation.approved ? -1 : 1;
    if (a.score.sliceCount !== b.score.sliceCount) return a.score.sliceCount - b.score.sliceCount;
    if (a.score.lastBelowDesiredMinimum !== b.score.lastBelowDesiredMinimum) return a.score.lastBelowDesiredMinimum - b.score.lastBelowDesiredMinimum;
    if (a.score.wastePx !== b.score.wastePx) return a.score.wastePx - b.score.wastePx;
    return b.score.smallestUsefulPx - a.score.smallestUsefulPx;
  })[0];
}

function maximumFillBoundaries(totalPx, usefulLimitPx) {
  const boundaries = [0];
  let cursor = 0;
  while (cursor < totalPx) {
    cursor = Math.min(totalPx, cursor + usefulLimitPx);
    boundaries.push(cursor);
  }
  return boundaries;
}

function balancedBoundaries(totalPx, sliceCount) {
  const base = Math.floor(totalPx / sliceCount);
  const remainder = totalPx % sliceCount;
  const boundaries = [0];
  let cursor = 0;
  for (let i = 0; i < sliceCount; i += 1) { cursor += base + (i < remainder ? 1 : 0); boundaries.push(cursor); }
  return boundaries;
}

function marginPixels(margin, dpi) {
  const sizeCm = Math.max(0, Number(margin?.sizeCm) || 0);
  return { topPx: margin?.top ? cmToCeilPx(sizeCm, dpi) : 0, rightPx: margin?.right ? cmToCeilPx(sizeCm, dpi) : 0, bottomPx: margin?.bottom ? cmToCeilPx(sizeCm, dpi) : 0, leftPx: margin?.left ? cmToCeilPx(sizeCm, dpi) : 0 };
}

function marginsForOrientation(margin, orientation, dpi) {
  const px = marginPixels(margin, dpi);
  return { ...px, axisTotalPx: orientation === "horizontal" ? px.topPx + px.bottomPx : px.leftPx + px.rightPx, crossAxisTotalPx: orientation === "horizontal" ? px.leftPx + px.rightPx : px.topPx + px.bottomPx };
}

function normalizeCuts(cutPositionsPx, totalAxisPx) {
  return [0, ...(cutPositionsPx || []), totalAxisPx].map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value >= 0 && value <= totalAxisPx).filter((value, index, arr) => arr.indexOf(value) === index).sort((a, b) => a - b);
}

function enforceLinkedValidity(boundaries, totalAxisPx, usefulLimitPx) {
  const result = [0];
  for (let i = 1; i < boundaries.length; i += 1) {
    const target = boundaries[i];
    let cursor = result.at(-1);
    while (target - cursor > usefulLimitPx) { cursor += usefulLimitPx; result.push(cursor); }
    if (target > result.at(-1)) result.push(target);
  }
  if (result.at(-1) !== totalAxisPx) result.push(totalAxisPx);
  return result;
}

function buildManualValidation({ boundaries, totalAxisPx, crossAxisPx, dpi, fabric, margin, orientation, minimumLastSliceCm }) {
  const maxPrintableWidthPx = cmToPx(fabric.maxPrintableWidthCm, dpi);
  const margins = marginsForOrientation(margin, orientation, dpi);
  const total = Math.max(0, boundaries.length - 1);
  const slices = [];
  for (let i = 0; i < total; i += 1) {
    const usefulPx = boundaries[i + 1] - boundaries[i];
    const finalAxisPx = usefulPx + margins.axisTotalPx;
    const finalCrossAxisPx = crossAxisPx + margins.crossAxisTotalPx;
    const finalWidthPx = orientation === "vertical" ? finalAxisPx : finalCrossAxisPx;
    const finalHeightPx = orientation === "horizontal" ? finalAxisPx : finalCrossAxisPx;
    slices.push({ index: i + 1, total, startPx: boundaries[i], endPx: boundaries[i + 1], usefulPx, usefulCm: pxToCm(usefulPx, dpi), finalLimitedAxisPx: finalAxisPx, finalLimitedAxisCm: pxToCm(finalAxisPx, dpi), finalWidthPx, finalHeightPx, finalWidthCm: pxToCm(finalWidthPx, dpi), finalHeightCm: pxToCm(finalHeightPx, dpi), seam: labelsForSlice(i + 1, total, orientation), valid: finalAxisPx <= maxPrintableWidthPx });
  }
  const reconstruction = validateReconstruction(slices, totalAxisPx);
  const minimumLastPx = cmToPx(Math.max(0, minimumLastSliceCm || 0), dpi);
  const lastSmall = slices.length > 1 && slices.at(-1).usefulPx < minimumLastPx;
  const violations = slices.filter((slice) => !slice.valid).map((slice) => `FAIXA ${slice.index}: ${slice.finalLimitedAxisCm.toFixed(2).replace(".", ",")} CM — EXCEDE O LIMITE DE ${fabric.maxPrintableWidthCm} CM`);
  return { approved: slices.every((slice) => slice.valid) && reconstruction.ok, slices, reconstruction, lastSmall, violations };
}

function validateReconstruction(slices, totalAxisPx) {
  let cursor = 0;
  let sum = 0;
  for (const slice of slices) {
    if (slice.startPx !== cursor) return { ok: false, reason: `Lacuna ou sobreposição antes da faixa ${slice.index}.` };
    sum += slice.usefulPx;
    cursor = slice.endPx;
  }
  if (cursor !== totalAxisPx || sum !== totalAxisPx) return { ok: false, reason: "Soma das áreas úteis não corresponde ao original." };
  return { ok: true, tolerancePx: 0 };
}
