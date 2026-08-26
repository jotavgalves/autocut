const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("autocut", {
  openImage: () => ipcRenderer.invoke("dialog:openImage"),
  inspectPath: (filePath) => ipcRenderer.invoke("image:inspectPath", filePath),
  chooseOutput: () => ipcRenderer.invoke("dialog:chooseOutput"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  exportJob: (job) => ipcRenderer.invoke("export:job", job)
});
