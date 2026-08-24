import { contextBridge, ipcRenderer } from "electron";
import { lumeChannels } from "../shared/lib";

contextBridge.exposeInMainWorld("lume", {
  ping: () => ipcRenderer.invoke(lumeChannels.ping),
  selectFolder: () => ipcRenderer.invoke(lumeChannels.selectFolder),
});
