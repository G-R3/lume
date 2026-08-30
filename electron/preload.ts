import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const lumeApi = {
  chooseMusicFolder: (): ReturnType<LumeApi["chooseMusicFolder"]> =>
    ipcRenderer.invoke(lumeChannels.chooseMusicFolder),
  forgetLibrarySource: (sourceId): ReturnType<LumeApi["forgetLibrarySource"]> =>
    ipcRenderer.invoke(lumeChannels.forgetLibrarySource, sourceId),
  loadMusicLibrary: (): ReturnType<LumeApi["loadMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadMusicLibrary),
  rescanLibrarySource: (sourceId): ReturnType<LumeApi["rescanLibrarySource"]> =>
    ipcRenderer.invoke(lumeChannels.rescanLibrarySource, sourceId),
  rescanMusicLibrary: (): ReturnType<LumeApi["rescanMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.rescanMusicLibrary),
  setLibrarySourceEnabled: (sourceId, enabled): ReturnType<LumeApi["setLibrarySourceEnabled"]> =>
    ipcRenderer.invoke(lumeChannels.setLibrarySourceEnabled, sourceId, enabled),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
