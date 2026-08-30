import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const lumeApi = {
  chooseMusicFolder: (): ReturnType<LumeApi["chooseMusicFolder"]> =>
    ipcRenderer.invoke(lumeChannels.chooseMusicFolder),
  loadMusicLibrary: (): ReturnType<LumeApi["loadMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadMusicLibrary),
  rescanMusicLibrary: (): ReturnType<LumeApi["rescanMusicLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.rescanMusicLibrary),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
