const { contextBridge, ipcRenderer } = require("electron");
const openArtwork=()=>ipcRenderer.invoke("dialog:openArtwork");
contextBridge.exposeInMainWorld("autocut", {
  openArtwork,
  openImage: openArtwork,
  inspectPath: (filePath,pageNumber) => ipcRenderer.invoke("artwork:inspectPath",filePath,pageNumber),
  chooseOutput: () => ipcRenderer.invoke("dialog:chooseOutput"),
  getCapabilities: () => ipcRenderer.invoke("capabilities:get"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set",settings),
  exportSettings: (settings) => ipcRenderer.invoke("settings:export",settings),
  importSettings: () => ipcRenderer.invoke("settings:import"),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  saveProject: (project) => ipcRenderer.invoke("project:save",project),
  openProject: () => ipcRenderer.invoke("project:open"),
  exportJob: (job) => ipcRenderer.invoke("export:job",job),
  generateSewingMap: (job) => ipcRenderer.invoke("map:generate",job)
});
