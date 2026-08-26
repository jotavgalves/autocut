import sharp from "sharp";
import { cmToCeilPx, cmToPx } from "../../shared/units.js";

export function assertJob(job) {
  if (!job?.source?.filePath || !job?.outputDirectory) throw new Error("Origem e pasta de saída são obrigatórias.");
  if (!Array.isArray(job.slices) || !job.slices.length) throw new Error("O plano não possui faixas válidas para processamento.");
}

export async function validateRasterSource(job) {
  assertJob(job);
  const sourceMeta = await sharp(job.source.filePath, { limitInputPixels: false }).metadata();
  if (sourceMeta.width !== job.source.widthPx || sourceMeta.height !== job.source.heightPx) {
    throw new Error("A arte de origem mudou desde que o projeto foi calculado.");
  }
  const dpi = Number(job.source.dpi);
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("DPI ausente ou inválido. Informe o DPI real da arte antes de exportar.");
  return { sourceMeta, dpi };
}

export function fullPlanReconstructionOk(job) {
  const expectedAxisPx = job.orientation === "horizontal" ? job.source.heightPx : job.source.widthPx;
  const reconstructionPx = job.slices.reduce((sum, slice) => sum + slice.usefulPx, 0);
  return reconstructionPx === expectedAxisPx && job.slices.every((slice, i) => {
    if (i === 0) return slice.startPx === 0;
    return job.slices[i - 1].endPx === slice.startPx;
  }) && job.slices.at(-1)?.endPx === expectedAxisPx;
}

export function selectedSlices(job) {
  const requested = Array.isArray(job.exportSliceIndices)
    ? [...new Set(job.exportSliceIndices.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (!requested.length) return job.slices;
  const set = new Set(requested);
  const selected = job.slices.filter((slice) => set.has(slice.index));
  if (selected.length !== set.size) throw new Error("Uma ou mais faixas solicitadas para reimpressão não existem no plano atual.");
  return selected;
}

export function marginPixels(margin, dpi) {
  const size = Math.max(0, Number(margin?.sizeCm) || 0);
  return {
    top: margin?.top ? cmToCeilPx(size, dpi) : 0,
    right: margin?.right ? cmToCeilPx(size, dpi) : 0,
    bottom: margin?.bottom ? cmToCeilPx(size, dpi) : 0,
    left: margin?.left ? cmToCeilPx(size, dpi) : 0,
    topPx: margin?.top ? cmToCeilPx(size, dpi) : 0,
    rightPx: margin?.right ? cmToCeilPx(size, dpi) : 0,
    bottomPx: margin?.bottom ? cmToCeilPx(size, dpi) : 0,
    leftPx: margin?.left ? cmToCeilPx(size, dpi) : 0
  };
}

export function fabricLimitPx(job, dpi) {
  return cmToPx(job.fabric.maxPrintableWidthCm, dpi);
}
