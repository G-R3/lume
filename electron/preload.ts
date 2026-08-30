import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const lumeApi = {
  addSource: (): ReturnType<LumeApi["addSource"]> => ipcRenderer.invoke(lumeChannels.addSource),
  disableSource: (sourceId): ReturnType<LumeApi["disableSource"]> =>
    ipcRenderer.invoke(lumeChannels.disableSource, sourceId),
  enableSource: (sourceId): ReturnType<LumeApi["enableSource"]> =>
    ipcRenderer.invoke(lumeChannels.enableSource, sourceId),
  forgetSource: (sourceId): ReturnType<LumeApi["forgetSource"]> =>
    ipcRenderer.invoke(lumeChannels.forgetSource, sourceId),
  loadLibrary: (): ReturnType<LumeApi["loadLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadLibrary),
  rescanSource: (sourceId): ReturnType<LumeApi["rescanSource"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSource, sourceId),
  rescanSources: (): ReturnType<LumeApi["rescanSources"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSources),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
