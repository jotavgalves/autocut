const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("autocut", {
  openImage: () => ipcRenderer.invoke("dialog:openImage"),
  inspectPath: (filePath) => ipcRenderer.invoke("image:inspectPath", filePath)
});
