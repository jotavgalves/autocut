import { ipcMain } from "electron";
import { inspectArtwork, renderPdfPreview } from "../services/imageService.js";
import { readSettings, writeSettings, exportSettings, importSettings, resetSettings } from "../services/settingsService.js";
import { saveProject, openProject } from "../services/projectService.js";
import { exportJob } from "../services/exportService.js";
import { generateSewingMap } from "../services/mapService.js";
import { resolveOutputPath } from "../services/outputPathService.js";
import { photoshopSupportedPlatform } from "../services/photoshopExportService.js";

export function registerIpc({ app, dialog }) {
  ipcMain.handle("dialog:openArtwork", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar arte",
      properties: ["openFile"],
      filters: [
        { name: "Artes suportadas", extensions: ["jpg","jpeg","png","tif","tiff","webp","avif","pdf","psd","psb"] },
        { name: "Todos os arquivos", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return inspectArtwork(result.filePaths[0], 1);
  });

  ipcMain.handle("dialog:chooseOutput", async () => {
    const result = await dialog.showOpenDialog({ title: "Selecionar pasta de saída", properties: ["openDirectory","createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("artwork:inspectPath", async (_, filePath, pageNumber) => inspectArtwork(filePath, pageNumber || 1));
  ipcMain.handle("settings:get", async () => readSettings(app));
  ipcMain.handle("settings:set", async (_, settings) => writeSettings(app, settings));
  ipcMain.handle("settings:export", async (_, settings) => exportSettings(dialog, settings));
  ipcMain.handle("settings:import", async () => importSettings(dialog));
  ipcMain.handle("settings:reset", async () => resetSettings(app));
  ipcMain.handle("project:save", async (_, project) => saveProject(dialog, project));
  ipcMain.handle("project:open", async () => openProject(dialog));
  ipcMain.handle("export:job", async (_, job) => exportJob(job, { dialog, resolveOutputPath }));
  ipcMain.handle("map:generate", async (_, job) => generateSewingMap(job, { dialog, resolveOutputPath, previewProvider: renderPdfPreview }));
  ipcMain.handle("capabilities:get", async () => ({
    input: { raster:true, pdf:true, psd:true, psb:true },
    output: { png:true, jpeg:true, tiff:true, pdf:true, psd:photoshopSupportedPlatform(), psb:photoshopSupportedPlatform() },
    photoshopAdapter: photoshopSupportedPlatform() ? "windows-com" : "unavailable"
  }));
}
