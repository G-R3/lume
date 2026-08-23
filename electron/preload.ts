import { contextBridge, ipcRenderer } from "electron/renderer";

contextBridge.exposeInMainWorld("lume", {
  ping: () => ipcRenderer.invoke("ping"),
});
