import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const lumeApi = {
  chooseMusicFolder: (): ReturnType<LumeApi["chooseMusicFolder"]> =>
    ipcRenderer.invoke(lumeChannels.chooseMusicFolder),
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
