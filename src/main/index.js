import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { baseNameFromPath, sanitizeFileName } from "../shared/naming.js";
import { cmToCeilPx, cmToPx } from "../shared/units.js";

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
    const result = await dialog.showOpenDialog({ title: "Selecionar pasta de saída", properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("image:inspectPath", async (_, filePath) => inspectImage(filePath));
  ipcMain.handle("settings:get", async () => readSettings());
  ipcMain.handle("settings:set", async (_, settings) => writeSettings(settings));
  ipcMain.handle("project:save", async (_, project) => saveProject(project));
  ipcMain.handle("project:open", async () => openProject());
  ipcMain.handle("export:job", async (_, job) => exportJob(job));
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
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
  return { ok: true, filePath };
}

async function saveProject(project) {
  const result = await dialog.showSaveDialog({
    title: "Salvar projeto AUTOCUT",
    defaultPath: `${sanitizeFileName(project?.baseName || "PROJETO")}.autocut.json`,
    filters: [{ name: "Projeto AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify({ version: 1, ...project }, null, 2), "utf8");
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

async function exportJob(job) {
  if (!job?.source?.filePath || !job?.outputDirectory) throw new Error("Origem e pasta de saída são obrigatórias.");
  const sourceMeta = await sharp(job.source.filePath, { limitInputPixels: false }).metadata();
  if (sourceMeta.width !== job.source.widthPx || sourceMeta.height !== job.source.heightPx) {
    throw new Error("A arte de origem mudou desde que o projeto foi calculado.");
  }

  const dpi = Number(job.source.dpi);
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("DPI ausente ou inválido. Informe o DPI real da arte antes de exportar.");
  const margins = marginPixels(job.margin, dpi);
  const limitPx = cmToPx(job.fabric.maxPrintableWidthCm, dpi);
  const results = [];
  const warnings = [];

  if (String(job.output.format).toUpperCase() === "JPEG" && (job.margin.transparent || sourceMeta.hasAlpha)) {
    warnings.push("JPEG não suporta transparência; áreas transparentes foram compostas sobre branco.");
  }

  for (const slice of job.slices) {
    const extract = job.orientation === "horizontal"
      ? { left: 0, top: slice.startPx, width: job.source.widthPx, height: slice.usefulPx }
      : { left: slice.startPx, top: 0, width: slice.usefulPx, height: job.source.heightPx };

    const finalWidthPx = extract.width + margins.leftPx + margins.rightPx;
    const finalHeightPx = extract.height + margins.topPx + margins.bottomPx;
    const finalLimitedPx = job.orientation === "horizontal" ? finalHeightPx : finalWidthPx;
    if (finalLimitedPx > limitPx) {
      throw new Error(`Faixa ${slice.index} excederia o limite do tecido antes da exportação.`);
    }

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

  const reconstructionPx = job.slices.reduce((sum, slice) => sum + slice.usefulPx, 0);
  const expectedAxisPx = job.orientation === "horizontal" ? job.source.heightPx : job.source.widthPx;
  const reconstructionOk = reconstructionPx === expectedAxisPx && job.slices.every((slice, i) => {
    if (i === 0) return slice.startPx === 0;
    return job.slices[i - 1].endPx === slice.startPx;
  }) && job.slices.at(-1)?.endPx === expectedAxisPx;

  const approved = reconstructionOk && results.filter((r) => !r.skipped).every((r) => r.validation?.approved);
  return {
    ok: approved,
    status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO",
    reconstructionOk,
    filesValidated: results.filter((r) => r.validation?.approved).length,
    filesGenerated: results.filter((r) => !r.skipped).length,
    results,
    warnings
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
    case "JPEG": return pipeline.jpeg({ quality: Math.max(1, Math.min(100, Number(output.quality) || 95)), chromaSubsampling: "4:4:4" });
    case "TIFF": return pipeline.tiff({ compression: output.tiffCompression || "lzw" });
    case "PNG": return pipeline.png({ compressionLevel: 6 });
    default: throw new Error(`Formato ainda não suportado neste build: ${output.format}`);
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
