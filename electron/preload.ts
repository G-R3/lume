import { contextBridge, ipcRenderer } from "electron";
import type { LibraryUpdate, LumeApi } from "../shared/lib";
import { lumeChannels } from "../shared/lib";

const libraryUpdateListeners = new Set<(update: LibraryUpdate) => void>();
let pendingLibraryUpdate: LibraryUpdate | undefined;

ipcRenderer.on(lumeChannels.libraryUpdated, (_event, update: LibraryUpdate) => {
  if (libraryUpdateListeners.size === 0) {
    pendingLibraryUpdate = update;
    return;
  }

  libraryUpdateListeners.forEach((listener) => listener(update));
});

const lumeApi = {
  addSource: (): ReturnType<LumeApi["addSource"]> => ipcRenderer.invoke(lumeChannels.addSource),
  createManualBackup: (replaceOldest): ReturnType<LumeApi["createManualBackup"]> =>
    ipcRenderer.invoke(lumeChannels.createManualBackup, replaceOldest),
  disableSource: (sourceId): ReturnType<LumeApi["disableSource"]> =>
    ipcRenderer.invoke(lumeChannels.disableSource, sourceId),
  enableSource: (sourceId): ReturnType<LumeApi["enableSource"]> =>
    ipcRenderer.invoke(lumeChannels.enableSource, sourceId),
  forgetSource: (sourceId): ReturnType<LumeApi["forgetSource"]> =>
    ipcRenderer.invoke(lumeChannels.forgetSource, sourceId),
  loadLibrary: (): ReturnType<LumeApi["loadLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadLibrary),
  loadBackups: (): ReturnType<LumeApi["loadBackups"]> =>
    ipcRenderer.invoke(lumeChannels.loadBackups),
  onLibraryUpdate: (listener) => {
    libraryUpdateListeners.add(listener);

    if (pendingLibraryUpdate) {
      listener(pendingLibraryUpdate);
      pendingLibraryUpdate = undefined;
    }

    return () => {
      libraryUpdateListeners.delete(listener);
    };
  },
  openDataFolder: (): ReturnType<LumeApi["openDataFolder"]> =>
    ipcRenderer.invoke(lumeChannels.openDataFolder),
  rescanSource: (sourceId): ReturnType<LumeApi["rescanSource"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSource, sourceId),
  rescanSources: (): ReturnType<LumeApi["rescanSources"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSources),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
