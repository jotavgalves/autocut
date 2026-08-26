import sharp from "sharp";
import { sanitizeFileName } from "../../shared/naming.js";
import { fabricLimitPx, fullPlanReconstructionOk, marginPixels, selectedSlices, validateRasterSource } from "./jobService.js";
import { renderTechnicalOverlay } from "./svgService.js";

export async function exportRasterJob(job, { dialog, resolveOutputPath }) {
  if (job.source?.engine === "pdf" || String(job.source?.format || "").toLowerCase() === "pdf" || /\.pdf$/i.test(job.source?.filePath || "")) {
    throw new Error("PDF vetorial não pode ser rasterizado silenciosamente. Defina uma resolução de rasterização em um fluxo específico.");
  }

  const { sourceMeta, dpi } = await validateRasterSource(job);
  const margins = marginPixels(job.margin, dpi, job.orientation);
  const limitPx = fabricLimitPx(job, dpi);
  const results = [];
  const warnings = [];
  const slicesToExport = selectedSlices(job);
  const reprintMode = slicesToExport.length !== job.slices.length;
  const format = String(job.output.format || "PNG").toUpperCase();

  if (format === "JPEG" && (job.margin.transparent || sourceMeta.hasAlpha)) warnings.push("JPEG não suporta transparência; áreas transparentes foram compostas sobre branco.");
  if (format === "JPEG" && sourceMeta.depth && sourceMeta.depth !== "uchar") warnings.push(`JPEG exige 8 bits por canal; a origem usa ${sourceMeta.depth}.`);
  if (reprintMode) warnings.push(`Modo reimpressão: ${slicesToExport.map((slice) => `${slice.index}/${job.slices.length}`).join(", ")}.`);

  for (const slice of slicesToExport) {
    const extract = job.orientation === "horizontal"
      ? { left: 0, top: slice.startPx, width: job.source.widthPx, height: slice.usefulPx }
      : { left: slice.startPx, top: 0, width: slice.usefulPx, height: job.source.heightPx };
    const finalWidthPx = extract.width + margins.leftPx + margins.rightPx;
    const finalHeightPx = extract.height + margins.topPx + margins.bottomPx;
    const finalLimitedPx = job.orientation === "horizontal" ? finalHeightPx : finalWidthPx;

    if (finalLimitedPx > limitPx) throw new Error(`Faixa ${slice.index} excederia o limite do tecido antes da exportação.`);

    const extension = extensionFor(format);
    const baseName = sanitizeFileName(slice.fileName || `${job.baseName}_FAIXA_${slice.index}-DE-${job.slices.length}`);
    const outputPath = await resolveOutputPath({ dialog, folder: job.outputDirectory, baseName, extension, policy: job.output.conflict || "version" });
    if (!outputPath) {
      results.push({ index: slice.index, skipped: true });
      continue;
    }

    const marginAlpha = job.margin.transparent ? 0 : Math.max(0, Math.min(1, Number(job.margin.opacity ?? 1)));
    const background = hexToRgba(job.margin.color || "#ffffff", marginAlpha);
    let pipeline = sharp(job.source.filePath, { limitInputPixels: false })
      .extract(extract)
      .extend({ top: margins.top, right: margins.right, bottom: margins.bottom, left: margins.left, background });

    if (format === "JPEG") pipeline = pipeline.flatten({ background: "#ffffff" });

    const overlay = renderTechnicalOverlay({
      width: finalWidthPx,
      height: finalHeightPx,
      margins,
      slice,
      orientation: job.orientation,
      dpi,
      identification: job.identification,
      baseName: job.baseName,
      nameSides: job.nameSides
    });
    if (overlay) pipeline = pipeline.composite([{ input: Buffer.from(overlay) }]);
    if (typeof pipeline.keepIccProfile === "function") pipeline = pipeline.keepIccProfile();
    pipeline = applyOutputFormat(pipeline.withMetadata({ density: dpi }), job.output, format);
    await pipeline.toFile(outputPath);

    const savedMeta = await sharp(outputPath, { limitInputPixels: false }).metadata();
    const savedDpi = savedMeta.density ?? null;
    const actualLimited = job.orientation === "horizontal" ? savedMeta.height : savedMeta.width;
    const sourceIcc = sourceMeta.icc ? Buffer.from(sourceMeta.icc) : null;
    const savedIcc = savedMeta.icc ? Buffer.from(savedMeta.icc) : null;
    const expectedDepth = format === "JPEG" ? "uchar" : sourceMeta.depth;
    const expectedAlpha = format === "JPEG" ? false : Boolean(sourceMeta.hasAlpha || job.margin.transparent || marginAlpha < 1);
    const validation = {
      dimensionsOk: savedMeta.width === finalWidthPx && savedMeta.height === finalHeightPx,
      dpiOk: savedDpi === dpi,
      limitOk: actualLimited <= limitPx && finalLimitedPx <= limitPx,
      colorSpaceOk: !sourceMeta.space || savedMeta.space === sourceMeta.space,
      iccOk: !sourceIcc || Boolean(savedIcc && Buffer.compare(sourceIcc, savedIcc) === 0),
      depthOk: !expectedDepth || savedMeta.depth === expectedDepth,
      alphaOk: Boolean(savedMeta.hasAlpha) === expectedAlpha,
      exclusiveMarginPairOk: margins.placement === "lateral"
        ? margins.topPx === 0 && margins.bottomPx === 0
        : margins.leftPx === 0 && margins.rightPx === 0
    };
    validation.approved = Object.values(validation).every(Boolean);
    results.push({ index: slice.index, filePath: outputPath, widthPx: savedMeta.width, heightPx: savedMeta.height, dpi: savedDpi, validation });
  }

  const reconstructionOk = fullPlanReconstructionOk(job);
  const generated = results.filter((result) => !result.skipped);
  const approved = reconstructionOk && generated.length > 0 && generated.every((result) => result.validation?.approved);
  return {
    ok: approved,
    status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO",
    mode: reprintMode ? "REPRINT" : "FULL",
    reconstructionOk,
    filesValidated: generated.filter((result) => result.validation?.approved).length,
    filesGenerated: generated.length,
    requestedSlices: slicesToExport.map((slice) => slice.index),
    results,
    warnings
  };
}

function applyOutputFormat(pipeline, output, format) {
  switch (format) {
    case "JPEG": return pipeline.jpeg({ quality: Math.max(1, Math.min(100, Number(output.quality) || 95)), chromaSubsampling: "4:4:4" });
    case "TIFF": return pipeline.tiff({ compression: output.tiffCompression || "lzw" });
    case "PNG": return pipeline.png({ compressionLevel: 6 });
    case "WEBP": return pipeline.webp({ quality: 100, lossless: true });
    case "AVIF": return pipeline.avif({ quality: 100, lossless: true });
    default: throw new Error(`Formato raster não suportado: ${format}`);
  }
}

function extensionFor(format) {
  if (format === "JPEG") return "jpg";
  if (format === "TIFF") return "tif";
  if (format === "PNG") return "png";
  if (format === "WEBP") return "webp";
  if (format === "AVIF") return "avif";
  throw new Error(`Formato raster não suportado: ${format}`);
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#ffffff").replace("#", "");
  const safe = /^[0-9a-f]{6}$/i.test(value) ? value : "ffffff";
  return { r: parseInt(safe.slice(0, 2), 16), g: parseInt(safe.slice(2, 4), 16), b: parseInt(safe.slice(4, 6), 16), alpha };
}
