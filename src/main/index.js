import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { baseNameFromPath, sanitizeFileName } from "../shared/naming.js";
import { cmToCeilPx, cmToPx, pxToCm } from "../shared/units.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.AUTOCUT_DEV_SERVER_URL;
const SETTINGS_FILE = "settings.json";

function createWindow() {
  const win = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "AUTOCUT",
    backgroundColor: "#111418",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.cjs")
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Falha ao carregar ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  if (devServerUrl) win.loadURL(devServerUrl);
  else win.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function registerIpc() {
  ipcMain.handle("dialog:openImage", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar arte",
      properties: ["openFile"],
      filters: [
        { name: "Imagens raster", extensions: ["jpg", "jpeg", "png", "tif", "tiff", "webp", "avif"] },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return inspectImage(result.filePaths[0]);
  });

  ipcMain.handle("dialog:chooseOutput", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar pasta de saída",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("image:inspectPath", async (_, filePath) => inspectImage(filePath));
  ipcMain.handle("settings:get", async () => readSettings());
  ipcMain.handle("settings:set", async (_, settings) => writeSettings(settings));
  ipcMain.handle("project:save", async (_, project) => saveProject(project));
  ipcMain.handle("project:open", async () => openProject());
  ipcMain.handle("export:job", async (_, job) => exportJob(job));
  ipcMain.handle("map:generate", async (_, job) => generateSewingMap(job));
}

async function inspectImage(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const baseName = baseNameFromPath(filePath);
    if (stat.size === 0) return { ok: false, filePath, baseName, sizeBytes: 0, error: "O arquivo possui 0 bytes." };

    const image = sharp(filePath, { limitInputPixels: false, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("Dimensões da imagem não puderam ser determinadas.");

    const dpi = metadata.density && metadata.density > 0 ? metadata.density : null;
    const previewBuffer = await sharp(filePath, { limitInputPixels: false })
      .resize({ width: 1800, height: 1200, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    return {
      ok: true,
      filePath,
      baseName,
      sizeBytes: stat.size,
      widthPx: metadata.width,
      heightPx: metadata.height,
      dpi,
      dpiDetected: Boolean(dpi),
      widthCm: dpi ? (metadata.width / dpi) * 2.54 : null,
      heightCm: dpi ? (metadata.height / dpi) * 2.54 : null,
      format: metadata.format,
      hasAlpha: Boolean(metadata.hasAlpha),
      space: metadata.space || "unknown",
      depth: metadata.depth || "unknown",
      channels: metadata.channels,
      previewDataUrl: `data:image/png;base64,${previewBuffer.toString("base64")}`
    };
  } catch (error) {
    return {
      ok: false,
      filePath,
      baseName: baseNameFromPath(filePath),
      error: `Falha ao decodificar a arte: ${error.message}`
    };
  }
}

async function readSettings() {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeSettings(settings) {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings || {}, null, 2), "utf8");
  return { ok: true, filePath };
}

async function saveProject(project) {
  const result = await dialog.showSaveDialog({
    title: "Salvar projeto AUTOCUT",
    defaultPath: `${sanitizeFileName(project?.baseName || "PROJETO")}.autocut.json`,
    filters: [{ name: "Projeto AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify({ version: 3, ...project }, null, 2), "utf8");
  return { ok: true, filePath: result.filePath };
}

async function openProject() {
  const result = await dialog.showOpenDialog({
    title: "Abrir projeto AUTOCUT",
    properties: ["openFile"],
    filters: [{ name: "Projeto AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  return { ok: true, filePath, project: data };
}

function assertJob(job) {
  if (!job?.source?.filePath || !job?.outputDirectory) throw new Error("Origem e pasta de saída são obrigatórias.");
  if (!Array.isArray(job.slices) || !job.slices.length) throw new Error("O plano não possui faixas válidas para processamento.");
}

async function validateSource(job) {
  assertJob(job);
  const sourceMeta = await sharp(job.source.filePath, { limitInputPixels: false }).metadata();
  if (sourceMeta.width !== job.source.widthPx || sourceMeta.height !== job.source.heightPx) {
    throw new Error("A arte de origem mudou desde que o projeto foi calculado.");
  }
  const dpi = Number(job.source.dpi);
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("DPI ausente ou inválido. Informe o DPI real da arte antes de exportar.");
  return { sourceMeta, dpi };
}

function fullPlanReconstructionOk(job) {
  const expectedAxisPx = job.orientation === "horizontal" ? job.source.heightPx : job.source.widthPx;
  const reconstructionPx = job.slices.reduce((sum, slice) => sum + slice.usefulPx, 0);
  return reconstructionPx === expectedAxisPx && job.slices.every((slice, i) => {
    if (i === 0) return slice.startPx === 0;
    return job.slices[i - 1].endPx === slice.startPx;
  }) && job.slices.at(-1)?.endPx === expectedAxisPx;
}

function selectedSlices(job) {
  const requested = Array.isArray(job.exportSliceIndices)
    ? [...new Set(job.exportSliceIndices.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (!requested.length) return job.slices;
  const set = new Set(requested);
  const selected = job.slices.filter((slice) => set.has(slice.index));
  if (selected.length !== set.size) throw new Error("Uma ou mais faixas solicitadas para reimpressão não existem no plano atual.");
  return selected;
}

async function exportJob(job) {
  const { sourceMeta, dpi } = await validateSource(job);
  const margins = marginPixels(job.margin, dpi);
  const limitPx = cmToPx(job.fabric.maxPrintableWidthCm, dpi);
  const results = [];
  const warnings = [];
  const slicesToExport = selectedSlices(job);
  const reprintMode = slicesToExport.length !== job.slices.length;

  if (String(job.output.format).toUpperCase() === "JPEG" && (job.margin.transparent || sourceMeta.hasAlpha)) {
    warnings.push("JPEG não suporta transparência; áreas transparentes foram compostas sobre branco.");
  }
  if (reprintMode) warnings.push(`Modo reimpressão: ${slicesToExport.map((slice) => `${slice.index}/${job.slices.length}`).join(", ")}.`);

  for (const slice of slicesToExport) {
    const extract = job.orientation === "horizontal"
      ? { left: 0, top: slice.startPx, width: job.source.widthPx, height: slice.usefulPx }
      : { left: slice.startPx, top: 0, width: slice.usefulPx, height: job.source.heightPx };

    const finalWidthPx = extract.width + margins.leftPx + margins.rightPx;
    const finalHeightPx = extract.height + margins.topPx + margins.bottomPx;
    const finalLimitedPx = job.orientation === "horizontal" ? finalHeightPx : finalWidthPx;
    if (finalLimitedPx > limitPx) throw new Error(`Faixa ${slice.index} excederia o limite do tecido antes da exportação.`);

    const extension = extensionFor(job.output.format);
    const baseName = sanitizeFileName(slice.fileName || `${job.baseName}_FAIXA_${slice.index}-DE-${job.slices.length}`);
    const outputPath = await resolveOutputPath(job.outputDirectory, baseName, extension, job.output.conflict || "version");
    if (!outputPath) {
      results.push({ index: slice.index, skipped: true });
      continue;
    }

    const background = job.margin.transparent && String(job.output.format).toUpperCase() !== "JPEG"
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : hexToRgba(job.margin.color || "#ffffff", 1);

    let pipeline = sharp(job.source.filePath, { limitInputPixels: false })
      .extract(extract)
      .extend({ top: margins.top, right: margins.right, bottom: margins.bottom, left: margins.left, background });

    if (String(job.output.format).toUpperCase() === "JPEG") pipeline = pipeline.flatten({ background: "#ffffff" });

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
    pipeline = pipeline.withMetadata({ density: dpi });
    pipeline = applyOutputFormat(pipeline, job.output);
    await pipeline.toFile(outputPath);

    const savedMeta = await sharp(outputPath, { limitInputPixels: false }).metadata();
    const savedDpi = savedMeta.density ?? null;
    const expectedLimited = job.orientation === "horizontal" ? finalHeightPx : finalWidthPx;
    const actualLimited = job.orientation === "horizontal" ? savedMeta.height : savedMeta.width;
    const sourceIcc = sourceMeta.icc ? Buffer.from(sourceMeta.icc) : null;
    const savedIcc = savedMeta.icc ? Buffer.from(savedMeta.icc) : null;
    const format = String(job.output.format || "PNG").toUpperCase();
    const expectedDepth = format === "JPEG" ? "uchar" : sourceMeta.depth;
    const expectedAlpha = format === "JPEG" ? false : Boolean(sourceMeta.hasAlpha || job.margin.transparent);
    const validation = {
      dimensionsOk: savedMeta.width === finalWidthPx && savedMeta.height === finalHeightPx,
      dpiOk: savedDpi === dpi,
      limitOk: actualLimited <= limitPx && expectedLimited <= limitPx,
      colorSpaceOk: !sourceMeta.space || savedMeta.space === sourceMeta.space,
      iccOk: !sourceIcc || Boolean(savedIcc && Buffer.compare(sourceIcc, savedIcc) === 0),
      depthOk: !expectedDepth || savedMeta.depth === expectedDepth,
      alphaOk: Boolean(savedMeta.hasAlpha) === expectedAlpha
    };
    validation.approved = Object.values(validation).every(Boolean);

    results.push({
      index: slice.index,
      filePath: outputPath,
      widthPx: savedMeta.width,
      heightPx: savedMeta.height,
      dpi: savedDpi,
      validation
    });
  }

  const reconstructionOk = fullPlanReconstructionOk(job);
  const generated = results.filter((r) => !r.skipped);
  const approved = reconstructionOk && generated.length > 0 && generated.every((r) => r.validation?.approved);
  return {
    ok: approved,
    status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO",
    mode: reprintMode ? "REPRINT" : "FULL",
    reconstructionOk,
    filesValidated: generated.filter((r) => r.validation?.approved).length,
    filesGenerated: generated.length,
    requestedSlices: slicesToExport.map((slice) => slice.index),
    results,
    warnings
  };
}

async function generateSewingMap(job) {
  const { dpi } = await validateSource(job);
  if (!fullPlanReconstructionOk(job)) throw new Error("O mapa não pode ser gerado porque a reconstrução matemática do plano falhou.");

  const { data: thumb, info } = await sharp(job.source.filePath, { limitInputPixels: false })
    .resize({ width: 1380, height: 820, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });

  const pageWidth = 1800;
  const imageX = Math.round((pageWidth - info.width) / 2);
  const imageY = 250;
  const listTop = imageY + info.height + 150;
  const rowHeight = 54;
  const pageHeight = Math.max(1350, listTop + job.slices.length * rowHeight + 180);
  const lines = [];
  const labels = [];

  for (let i = 0; i < job.slices.length - 1; i += 1) {
    const slice = job.slices[i];
    if (job.orientation === "horizontal") {
      const y = imageY + (slice.endPx / job.source.heightPx) * info.height;
      lines.push(`<line x1="${imageX}" y1="${y.toFixed(2)}" x2="${imageX + info.width}" y2="${y.toFixed(2)}" stroke="#d92d20" stroke-width="5" stroke-dasharray="18 12"/>`);
      const seam = slice.seam?.labels?.after;
      if (seam) labels.push(`<text x="${imageX + 16}" y="${y - 12}" font-size="30" font-weight="800" fill="#101828">${escapeXml(seam[0])}</text><text x="${imageX + info.width - 16}" y="${y - 12}" text-anchor="end" font-size="30" font-weight="800" fill="#101828">${escapeXml(seam[1])}</text>`);
    } else {
      const x = imageX + (slice.endPx / job.source.widthPx) * info.width;
      lines.push(`<line x1="${x.toFixed(2)}" y1="${imageY}" x2="${x.toFixed(2)}" y2="${imageY + info.height}" stroke="#d92d20" stroke-width="5" stroke-dasharray="18 12"/>`);
      const seam = slice.seam?.labels?.after;
      if (seam) labels.push(`<text x="${x + 12}" y="${imageY + 34}" font-size="30" font-weight="800" fill="#101828">${escapeXml(seam[0])}</text><text x="${x + 12}" y="${imageY + info.height - 18}" font-size="30" font-weight="800" fill="#101828">${escapeXml(seam[1])}</text>`);
    }
  }

  const sliceRows = job.slices.map((slice, i) => {
    const y = listTop + i * rowHeight;
    const before = slice.seam?.labels?.before?.join("/") || "—";
    const after = slice.seam?.labels?.after?.join("/") || "—";
    const usefulCm = pxToCm(slice.usefulPx, dpi).toFixed(2).replace(".", ",");
    const finalCm = Number(slice.finalLimitedAxisCm || 0).toFixed(2).replace(".", ",");
    return `<rect x="150" y="${y - 34}" width="1500" height="46" rx="8" fill="${i % 2 ? "#f2f4f7" : "#ffffff"}"/><text x="175" y="${y}" font-size="26" font-weight="800" fill="#101828">FAIXA ${slice.index}/${job.slices.length}</text><text x="480" y="${y}" font-size="23" fill="#344054">ÚTIL ${usefulCm} CM</text><text x="760" y="${y}" font-size="23" fill="#344054">FINAL ${finalCm} CM</text><text x="1080" y="${y}" font-size="23" fill="#344054">ANTES ${escapeXml(before)}</text><text x="1370" y="${y}" font-size="23" fill="#344054">DEPOIS ${escapeXml(after)}</text>`;
  }).join("");

  const thumbnailData = thumb.toString("base64");
  const title = escapeXml(String(job.baseName || "ARTE").toUpperCase());
  const fabric = escapeXml(job.fabric?.name || "");
  const orientation = job.orientation === "horizontal" ? "HORIZONTAL" : "VERTICAL";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageWidth}" height="${pageHeight}"><rect width="100%" height="100%" fill="#ffffff"/><text x="120" y="88" font-size="52" font-family="Arial" font-weight="900" fill="#101828">MAPA DE COSTURA</text><text x="120" y="138" font-size="27" font-family="Arial" fill="#344054">${title}</text><text x="120" y="182" font-size="24" font-family="Arial" fill="#475467">TECIDO: ${fabric} · LIMITE: ${escapeXml(String(job.fabric.maxPrintableWidthCm).replace(".", ","))} CM · ORIENTAÇÃO: ${orientation} · ${job.slices.length} FAIXA(S)</text><image x="${imageX}" y="${imageY}" width="${info.width}" height="${info.height}" xlink:href="data:image/png;base64,${thumbnailData}"/><rect x="${imageX}" y="${imageY}" width="${info.width}" height="${info.height}" fill="none" stroke="#101828" stroke-width="4"/>${lines.join("")}${labels.join("")}<text x="150" y="${listTop - 70}" font-size="31" font-family="Arial" font-weight="800" fill="#101828">ORDEM E EMENDAS</text>${sliceRows}<text x="150" y="${pageHeight - 70}" font-size="20" font-family="Arial" fill="#667085">AUTOCUT · DPI ORIGINAL ${dpi} · mapa gerado a partir das mesmas posições de corte do projeto</text></svg>`;

  const baseName = `${sanitizeFileName(job.baseName || "ARTE")}_MAPA_DE_COSTURA`;
  const outputPath = await resolveOutputPath(job.outputDirectory, baseName, "jpg", job.output?.conflict || "version");
  if (!outputPath) return { ok: false, skipped: true, filePath: null };

  await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .withMetadata({ density: 150 })
    .toFile(outputPath);

  const saved = await sharp(outputPath).metadata();
  return {
    ok: Boolean(saved.width === pageWidth && saved.height === pageHeight),
    filePath: outputPath,
    widthPx: saved.width,
    heightPx: saved.height,
    slices: job.slices.length
  };
}

function marginPixels(margin, dpi) {
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

function renderTechnicalOverlay({ width, height, margins, slice, orientation, dpi, identification, baseName, nameSides }) {
  if (!identification?.enabled && !Object.values(nameSides || {}).some(Boolean)) return null;
  const fill = escapeXml(identification?.color || "#111111");
  const family = escapeXml(identification?.font || "Arial");
  const requested = Math.max(8, Math.round(((Number(identification?.sizeCm) || 2) / 2.54) * dpi));
  const pad = Math.max(4, Math.round(((Number(identification?.edgeDistanceCm) || 0.18) / 2.54) * dpi));
  const text = [];

  if (identification?.enabled) {
    const before = slice.seam?.labels?.before;
    const after = slice.seam?.labels?.after;
    if (orientation === "horizontal") {
      if (before && margins.topPx > 0) addHorizontalPair(text, before, margins.topPx / 2, width, margins, requested, fill, family, pad);
      if (after && margins.bottomPx > 0) addHorizontalPair(text, after, height - margins.bottomPx / 2, width, margins, requested, fill, family, pad);
    } else {
      if (before && margins.leftPx > 0) addVerticalPair(text, before, margins.leftPx / 2, height, margins, margins.leftPx, requested, fill, family, pad, -90);
      if (after && margins.rightPx > 0) addVerticalPair(text, after, width - margins.rightPx / 2, height, margins, margins.rightPx, requested, fill, family, pad, 90);
    }
  }

  const artName = escapeXml(String(baseName || "").toUpperCase());
  if (artName && nameSides) {
    const nameSize = Math.max(8, Math.round(requested * 0.55));
    if (nameSides.top && margins.topPx > 0) text.push(svgText(width / 2, margins.topPx / 2, artName, Math.min(nameSize, margins.topPx * 0.55), fill, family, "middle"));
    if (nameSides.bottom && margins.bottomPx > 0) text.push(svgText(width / 2, height - margins.bottomPx / 2, artName, Math.min(nameSize, margins.bottomPx * 0.55), fill, family, "middle"));
    if (nameSides.left && margins.leftPx > 0) text.push(svgRotatedText(margins.leftPx / 2, height / 2, artName, Math.min(nameSize, margins.leftPx * 0.55), fill, family, -90));
    if (nameSides.right && margins.rightPx > 0) text.push(svgRotatedText(width - margins.rightPx / 2, height / 2, artName, Math.min(nameSize, margins.rightPx * 0.55), fill, family, 90));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text.join("")}</svg>`;
}

function addHorizontalPair(out, labels, y, width, margins, requested, fill, family, pad) {
  const available = Math.max(8, (y <= margins.topPx ? margins.topPx : margins.bottomPx) - pad * 2);
  const size = Math.min(requested, available * 0.75);
  out.push(svgText(margins.leftPx + pad, y, escapeXml(labels[0]), size, fill, family, "start"));
  out.push(svgText(width - margins.rightPx - pad, y, escapeXml(labels[1]), size, fill, family, "end"));
}

function addVerticalPair(out, labels, x, height, margins, sideWidth, requested, fill, family, pad, rotation) {
  const size = Math.min(requested, Math.max(8, (sideWidth - pad * 2) * 0.75));
  out.push(svgRotatedText(x, margins.topPx + pad + size, escapeXml(labels[0]), size, fill, family, rotation));
  out.push(svgRotatedText(x, height - margins.bottomPx - pad - size, escapeXml(labels[1]), size, fill, family, rotation));
}

function svgText(x, y, value, size, fill, family, anchor) {
  return `<text x="${Math.round(x)}" y="${Math.round(y)}" fill="${fill}" font-family="${family}" font-size="${Math.max(8, Math.round(size))}" font-weight="700" text-anchor="${anchor}" dominant-baseline="middle">${value}</text>`;
}

function svgRotatedText(x, y, value, size, fill, family, rotation) {
  return `<text transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${rotation})" fill="${fill}" font-family="${family}" font-size="${Math.max(8, Math.round(size))}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
}

function applyOutputFormat(pipeline, output) {
  switch (String(output.format || "PNG").toUpperCase()) {
    case "JPEG":
      return pipeline.jpeg({
        quality: Math.max(1, Math.min(100, Number(output.quality) || 95)),
        chromaSubsampling: "4:4:4"
      });
    case "TIFF":
      return pipeline.tiff({ compression: output.tiffCompression || "lzw" });
    case "PNG":
      return pipeline.png({ compressionLevel: 6 });
    default:
      throw new Error(`Formato ainda não suportado neste build: ${output.format}`);
  }
}

function extensionFor(format) {
  const key = String(format || "PNG").toUpperCase();
  if (key === "JPEG") return "jpg";
  if (key === "TIFF") return "tif";
  if (key === "PNG") return "png";
  throw new Error(`Formato ainda não suportado neste build: ${format}`);
}

async function resolveOutputPath(folder, baseName, extension, policy) {
  await fs.mkdir(folder, { recursive: true });
  const initial = path.join(folder, `${baseName}.${extension}`);
  if (!existsSync(initial) || policy === "overwrite") return initial;
  if (policy === "skip") return null;

  if (policy === "ask") {
    const choice = await dialog.showMessageBox({
      type: "question",
      title: "Arquivo já existe",
      message: path.basename(initial),
      detail: "Escolha como o AUTOCUT deve tratar este conflito.",
      buttons: ["Substituir", "Criar versão", "Ignorar"],
      defaultId: 1,
      cancelId: 2,
      noLink: true
    });
    if (choice.response === 0) return initial;
    if (choice.response === 2) return null;
  }

  let version = 2;
  while (true) {
    const candidate = path.join(folder, `${baseName}_V${version}.${extension}`);
    if (!existsSync(candidate)) return candidate;
    version += 1;
  }
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#ffffff").replace("#", "");
  const safe = /^[0-9a-f]{6}$/i.test(value) ? value : "ffffff";
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
    alpha
  };
}
