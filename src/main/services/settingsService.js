import path from "node:path";
import fs from "node:fs/promises";

const SETTINGS_FILE = "settings.json";

export async function readSettings(app) {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch { return null; }
}

export async function writeSettings(app, settings) {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings || {}, null, 2), "utf8");
  return { ok: true, filePath };
}

export async function exportSettings(dialog, settings) {
  const result = await dialog.showSaveDialog({
    title: "Exportar configurações AUTOCUT",
    defaultPath: "AUTOCUT_CONFIGURACOES.json",
    filters: [{ name: "Configurações AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify({ schema: 1, settings: settings || {} }, null, 2), "utf8");
  return { ok: true, filePath: result.filePath };
}

export async function importSettings(dialog) {
  const result = await dialog.showOpenDialog({
    title: "Importar configurações AUTOCUT",
    properties: ["openFile"],
    filters: [{ name: "Configurações AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  const settings = data?.settings && typeof data.settings === "object" ? data.settings : data;
  return { ok: true, filePath, settings };
}

export async function resetSettings(app) {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  try { await fs.unlink(filePath); } catch {}
  return { ok: true };
}
