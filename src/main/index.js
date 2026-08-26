import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { baseNameFromPath } from "../shared/naming.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.AUTOCUT_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1120,
    minHeight: 720,
    title: "AUTOCUT",
    backgroundColor: "#f4f2ed",
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

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer encerrado: ${details.reason}`);
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
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
        { name: "Imagens", extensions: ["jpg", "jpeg", "png", "tif", "tiff", "webp", "avif"] },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return inspectImage(result.filePaths[0]);
  });

  ipcMain.handle("image:inspectPath", async (_, filePath) => inspectImage(filePath));
}

async function inspectImage(filePath) {
  const stat = await fs.stat(filePath);
  const baseName = baseNameFromPath(filePath);
  if (stat.size === 0) {
    return {
      ok: false,
      filePath,
      baseName,
      sizeBytes: stat.size,
      error: "O arquivo existe, mas possui 0 bytes. Nao ha dados de imagem para decodificar."
    };
  }

  try {
    const image = sharp(filePath, { limitInputPixels: false });
    const metadata = await image.metadata();
    const dpi = metadata.density && metadata.density > 0 ? metadata.density : 300;
    return {
      ok: true,
      filePath,
      baseName,
      sizeBytes: stat.size,
      widthPx: metadata.width,
      heightPx: metadata.height,
      dpi,
      widthCm: metadata.width ? (metadata.width / dpi) * 2.54 : null,
      heightCm: metadata.height ? (metadata.height / dpi) * 2.54 : null,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha,
      space: metadata.space,
      depth: metadata.depth
    };
  } catch (error) {
    return {
      ok: false,
      filePath,
      baseName,
      sizeBytes: stat.size,
      error: `Falha ao decodificar imagem: ${error.message}`
    };
  }
}
