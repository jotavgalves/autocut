import fs from "node:fs/promises";
import { sanitizeFileName } from "../../shared/naming.js";

export async function saveProject(dialog, project) {
  const result = await dialog.showSaveDialog({
    title: "Salvar projeto AUTOCUT",
    defaultPath: `${sanitizeFileName(project?.baseName || "PROJETO")}.autocut.json`,
    filters: [{ name: "Projeto AUTOCUT", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify({ version: 4, ...project }, null, 2), "utf8");
  return { ok: true, filePath: result.filePath };
}

export async function openProject(dialog) {
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
