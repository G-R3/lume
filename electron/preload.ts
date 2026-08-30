import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const lumeApi = {
  chooseMusicFolder: (): ReturnType<LumeApi["chooseMusicFolder"]> =>
    ipcRenderer.invoke(lumeChannels.chooseMusicFolder),
  disableSource: (sourceId): ReturnType<LumeApi["disableSource"]> =>
    ipcRenderer.invoke(lumeChannels.disableSource, sourceId),
  enableSource: (sourceId): ReturnType<LumeApi["enableSource"]> =>
    ipcRenderer.invoke(lumeChannels.enableSource, sourceId),
  forgetLibrarySource: (sourceId): ReturnType<LumeApi["forgetLibrarySource"]> =>
    ipcRenderer.invoke(lumeChannels.forgetLibrarySource, sourceId),
  loadMusicLibrary: (): ReturnType<LumeApi["loadMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadMusicLibrary),
  rescanLibrarySource: (sourceId): ReturnType<LumeApi["rescanLibrarySource"]> =>
    ipcRenderer.invoke(lumeChannels.rescanLibrarySource, sourceId),
  rescanMusicLibrary: (): ReturnType<LumeApi["rescanMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.rescanMusicLibrary),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
