import { cmToCeilPx, cmToFloorPx, cmToPx, pxToCm } from "./units.js";
import { labelsForSlice } from "./seams.js";
import { DEFAULT_NAME_TEMPLATE, renderNameTemplate } from "./naming.js";

const DIMENSION_TOLERANCE_PX = 1;

export function planCutJob({
  widthCm,
  heightCm,
  dpi = 300,
  fabric,
  margin,
  orientation = "auto",
  baseName = "ARTE",
  namingTemplate = DEFAULT_NAME_TEMPLATE,
  minimumLastSliceCm = 10
}) {
  const document = normalizeDocument(widthCm, heightCm, dpi);
  const maxPrintableWidthPx = cmToFloorPx(fabric.maxPrintableWidthCm, dpi);
  const widthPx = cmToPx(document.widthCm, dpi);
  const heightPx = cmToPx(document.heightCm, dpi);
  const noCut = evaluateNoCut(document, fabric.maxPrintableWidthCm);

  if (noCut.fits) {
    return {
      status: "NO_CUT_NEEDED",
      message: "ESTA ARTE NAO PRECISA SER DIVIDIDA.",
      document,
      fabric,
      orientation: noCut.orientation,
      rotatedForPrint: noCut.rotatedForPrint,
      slices: [],
      validation: {
        approved: true,
        checks: ["Uma das dimensoes cabe no limite fisico do tecido."]
      }
    };
  }

  const candidates = [];
  if (orientation === "auto" || orientation === "horizontal") {
    candidates.push(buildCandidate({
      orientation: "horizontal",
      axisPx: heightPx,
      crossAxisPx: widthPx,
      axisCm: document.heightCm,
      crossAxisCm: document.widthCm,
      dpi,
      fabric,
      maxPrintableWidthPx,
      margin,
      baseName,
      namingTemplate,
      minimumLastSliceCm
    }));
  }
  if (orientation === "auto" || orientation === "vertical") {
    candidates.push(buildCandidate({
      orientation: "vertical",
      axisPx: widthPx,
      crossAxisPx: heightPx,
      axisCm: document.widthCm,
      crossAxisCm: document.heightCm,
      dpi,
      fabric,
      maxPrintableWidthPx,
      margin,
      baseName,
      namingTemplate,
      minimumLastSliceCm
    }));
  }

  const validCandidates = candidates.filter((candidate) => candidate.validation.approved);
  const selected = chooseBestCandidate(validCandidates.length ? validCandidates : candidates);

  return {
    status: selected.validation.approved ? "CUT_REQUIRED" : "INVALID",
    message: selected.validation.approved ? "CORTE OBRIGATORIO." : "NAO E POSSIVEL GERAR FAIXAS VALIDAS.",
    document,
    fabric,
    ...selected
  };
}

export function validateManualCuts({
  cutPositionsPx,
  totalAxisPx,
  dpi,
  fabric,
  margin,
  orientation,
  linkedMode = false
}) {
  const maxPrintableWidthPx = cmToFloorPx(fabric.maxPrintableWidthCm, dpi);
  const effectiveLimitPx = maxPrintableWidthPx + DIMENSION_TOLERANCE_PX;
  const marginsOnLimitedAxisPx = marginsForOrientation(margin, orientation, dpi).axisTotalPx;
  const usefulLimitPx = effectiveLimitPx - marginsOnLimitedAxisPx;
  if (usefulLimitPx <= 0) throw new Error("As margens consomem toda a largura imprimivel.");

  const rawCuts = [0, ...cutPositionsPx, totalAxisPx]
    .map((value) => Math.round(value))
    .filter((value, index, arr) => value >= 0 && value <= totalAxisPx && arr.indexOf(value) === index)
    .sort((a, b) => a - b);

  if (linkedMode) {
    return redistributeFromFirstCuts(rawCuts, totalAxisPx, usefulLimitPx, dpi, fabric, margin, orientation);
  }

  const slices = [];
  for (let i = 0; i < rawCuts.length - 1; i += 1) {
    const usefulPx = rawCuts[i + 1] - rawCuts[i];
    const finalPx = usefulPx + marginsOnLimitedAxisPx;
    slices.push({
      index: i + 1,
      startPx: rawCuts[i],
      endPx: rawCuts[i + 1],
      usefulPx,
      finalLimitedAxisPx: finalPx,
      finalLimitedAxisCm: pxToCm(finalPx, dpi),
      valid: finalPx <= effectiveLimitPx
    });
  }

  return {
    approved: slices.every((slice) => slice.valid) && validateReconstruction(slices, totalAxisPx).ok,
    slices,
    reconstruction: validateReconstruction(slices, totalAxisPx),
    violations: slices
      .filter((slice) => !slice.valid)
      .map((slice) => `FAIXA ${slice.index}: ${slice.finalLimitedAxisCm.toFixed(2)} CM - EXCEDE O LIMITE DE ${fabric.maxPrintableWidthCm} CM`)
  };
}

function normalizeDocument(widthCm, heightCm, dpi) {
  for (const [label, value] of [["largura", widthCm], ["altura", heightCm], ["DPI", dpi]]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} invalido.`);
  }
  return { widthCm, heightCm, dpi };
}

function evaluateNoCut(document, limitCm) {
  const widthFits = document.widthCm <= limitCm;
  const heightFits = document.heightCm <= limitCm;
  if (widthFits || heightFits) {
    return {
      fits: true,
      orientation: widthFits ? "as-is" : "rotated-90",
      rotatedForPrint: !widthFits && heightFits
    };
  }
  return { fits: false, orientation: "none", rotatedForPrint: false };
}

function buildCandidate(options) {
  const margins = marginsForOrientation(options.margin, options.orientation, options.dpi);
  const effectiveLimitPx = options.maxPrintableWidthPx + DIMENSION_TOLERANCE_PX;
  const usefulLimitPx = effectiveLimitPx - margins.axisTotalPx;
  if (usefulLimitPx <= 0) {
    return {
      orientation: options.orientation,
      slices: [],
      validation: {
        approved: false,
        errors: ["Margens maiores que a largura imprimivel do tecido."]
      }
    };
  }

  const sliceCount = Math.ceil(options.axisPx / usefulLimitPx);
  const boundaries = balancedBoundaries(options.axisPx, sliceCount);
  const slices = boundaries.slice(0, -1).map((startPx, index) => {
    const endPx = boundaries[index + 1];
    const usefulPx = endPx - startPx;
    const finalAxisPx = usefulPx + margins.axisTotalPx;
    const finalCrossAxisPx = options.crossAxisPx + margins.crossAxisTotalPx;
    const finalWidthPx = options.orientation === "vertical" ? finalAxisPx : finalCrossAxisPx;
    const finalHeightPx = options.orientation === "horizontal" ? finalAxisPx : finalCrossAxisPx;
    const finalWidthCm = pxToCm(finalWidthPx, options.dpi);
    const finalHeightCm = pxToCm(finalHeightPx, options.dpi);
    const seam = labelsForSlice(index + 1, sliceCount, options.orientation);

    return {
      index: index + 1,
      total: sliceCount,
      startPx,
      endPx,
      usefulPx,
      usefulCm: pxToCm(usefulPx, options.dpi),
      finalLimitedAxisPx: finalAxisPx,
      finalLimitedAxisCm: pxToCm(finalAxisPx, options.dpi),
      finalWidthCm,
      finalHeightCm,
      seam,
      fileName: renderNameTemplate(options.namingTemplate, {
        NOME: options.baseName,
        FAIXA: index + 1,
        TOTAL_FAIXAS: sliceCount,
        FRACAO_FAIXA: `${index + 1}-DE-${sliceCount}`,
        TECIDO: options.fabric.name,
        LARGURA: finalWidthCm.toFixed(2).replace(".", ","),
        ALTURA: finalHeightCm.toFixed(2).replace(".", ","),
        TAMANHO: `${finalWidthCm.toFixed(2)}X${finalHeightCm.toFixed(2)}`,
        FORMATO: "PNG",
        DPI: options.dpi,
        PEDIDO: "",
        DATA: new Date().toISOString().slice(0, 10)
      })
    };
  });

  const reconstruction = validateReconstruction(slices, options.axisPx);
  const errors = [];
  for (const slice of slices) {
    if (slice.finalLimitedAxisPx > effectiveLimitPx) {
      errors.push(`Faixa ${slice.index} excede o limite final do tecido.`);
    }
  }
  if (!reconstruction.ok) errors.push("Reconstrucao da arte falhou.");

  return {
    orientation: options.orientation,
    usefulLimitCm: pxToCm(usefulLimitPx, options.dpi),
    margins,
    slices,
    score: {
      sliceCount,
      smallestUsefulPx: Math.min(...slices.map((slice) => slice.usefulPx)),
      wastePx: (sliceCount * usefulLimitPx) - options.axisPx
    },
    validation: {
      approved: errors.length === 0,
      errors,
      reconstruction
    }
  };
}

function chooseBestCandidate(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.validation.approved !== b.validation.approved) return a.validation.approved ? -1 : 1;
    if (a.score.sliceCount !== b.score.sliceCount) return a.score.sliceCount - b.score.sliceCount;
    if (a.score.wastePx !== b.score.wastePx) return a.score.wastePx - b.score.wastePx;
    return b.score.smallestUsefulPx - a.score.smallestUsefulPx;
  })[0];
}

function balancedBoundaries(totalPx, sliceCount) {
  const boundaries = [];
  for (let i = 0; i <= sliceCount; i += 1) {
    boundaries.push(Math.round((i * totalPx) / sliceCount));
  }
  return boundaries;
}

function marginsForOrientation(margin, orientation, dpi) {
  const top = margin.top ? cmToCeilPx(margin.sizeCm, dpi) : 0;
  const right = margin.right ? cmToCeilPx(margin.sizeCm, dpi) : 0;
  const bottom = margin.bottom ? cmToCeilPx(margin.sizeCm, dpi) : 0;
  const left = margin.left ? cmToCeilPx(margin.sizeCm, dpi) : 0;
  return {
    topPx: top,
    rightPx: right,
    bottomPx: bottom,
    leftPx: left,
    axisTotalPx: orientation === "horizontal" ? top + bottom : left + right,
    crossAxisTotalPx: orientation === "horizontal" ? left + right : top + bottom
  };
}

function validateReconstruction(slices, totalAxisPx) {
  let cursor = 0;
  let sum = 0;
  for (const slice of slices) {
    if (slice.startPx !== cursor) {
      return { ok: false, reason: `Lacuna ou sobreposicao antes da faixa ${slice.index}.` };
    }
    sum += slice.usefulPx;
    cursor = slice.endPx;
  }
  if (cursor !== totalAxisPx || sum !== totalAxisPx) {
    return { ok: false, reason: "Soma das areas uteis nao corresponde ao original." };
  }
  return { ok: true, tolerancePx: 0 };
}

function redistributeFromFirstCuts(rawCuts, totalAxisPx, usefulLimitPx, dpi, fabric, margin, orientation) {
  const safeCuts = [0];
  let cursor = 0;
  for (const desired of rawCuts.slice(1, -1)) {
    if (desired <= cursor) continue;
    while (desired - cursor > usefulLimitPx) {
      cursor += usefulLimitPx;
      safeCuts.push(cursor);
    }
    cursor = desired;
    safeCuts.push(cursor);
  }
  while (totalAxisPx - cursor > usefulLimitPx) {
    cursor += usefulLimitPx;
    safeCuts.push(cursor);
  }
  return validateManualCuts({
    cutPositionsPx: safeCuts.slice(1),
    totalAxisPx,
    dpi,
    fabric,
    margin,
    orientation,
    linkedMode: false
  });
}
