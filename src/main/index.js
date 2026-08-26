import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc/registerIpc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.AUTOCUT_DEV_SERVER_URL;

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
  registerIpc({ app, dialog });
  createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
