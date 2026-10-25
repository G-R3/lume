import { contextBridge, ipcRenderer } from "electron";
import {
  createBufferedListeners,
  lumeChannels,
  type LibraryUpdate,
  type LumeApi,
} from "../shared/lib";

const libraryUpdates = createBufferedListeners<LibraryUpdate>();

ipcRenderer.on(lumeChannels.libraryUpdated, (_event, update: LibraryUpdate) => {
  libraryUpdates.publish(update);
});

const lumeApi = {
  addTrackToPlaylist: (input): ReturnType<LumeApi["addTrackToPlaylist"]> =>
    ipcRenderer.invoke(lumeChannels.addTrackToPlaylist, input),
  addSource: (): ReturnType<LumeApi["addSource"]> => ipcRenderer.invoke(lumeChannels.addSource),
  confirmAddTrackToPlaylist: (input): ReturnType<LumeApi["confirmAddTrackToPlaylist"]> =>
    ipcRenderer.invoke(lumeChannels.confirmAddTrackToPlaylist, input),
  createPlaylist: (input): ReturnType<LumeApi["createPlaylist"]> =>
    ipcRenderer.invoke(lumeChannels.createPlaylist, input),
  createPlaylistFromTrack: (trackId): ReturnType<LumeApi["createPlaylistFromTrack"]> =>
    ipcRenderer.invoke(lumeChannels.createPlaylistFromTrack, trackId),
  deletePlaylist: (playlistId): ReturnType<LumeApi["deletePlaylist"]> =>
    ipcRenderer.invoke(lumeChannels.deletePlaylist, playlistId),
  disableSource: (sourceId): ReturnType<LumeApi["disableSource"]> =>
    ipcRenderer.invoke(lumeChannels.disableSource, sourceId),
  enableSource: (sourceId): ReturnType<LumeApi["enableSource"]> =>
    ipcRenderer.invoke(lumeChannels.enableSource, sourceId),
  forgetSource: (sourceId): ReturnType<LumeApi["forgetSource"]> =>
    ipcRenderer.invoke(lumeChannels.forgetSource, sourceId),
  loadLibrary: (): ReturnType<LumeApi["loadLibrary"]> =>
    ipcRenderer.invoke(lumeChannels.loadLibrary),
  loadPlaylist: (playlistId): ReturnType<LumeApi["loadPlaylist"]> =>
    ipcRenderer.invoke(lumeChannels.loadPlaylist, playlistId),
  playbackSession: {
    flush: (session) => {
      const result: unknown = ipcRenderer.sendSync(lumeChannels.flushPlaybackSession, session);

      if (result !== true) throw new Error("Could not save playback");
    },
    load: (): ReturnType<LumeApi["playbackSession"]["load"]> =>
      ipcRenderer.invoke(lumeChannels.loadPlaybackSession),
    save: (session): Promise<void> => ipcRenderer.invoke(lumeChannels.savePlaybackSession, session),
    savePosition: (position): Promise<void> =>
      ipcRenderer.invoke(lumeChannels.savePlaybackPosition, position),
  },
  onLibraryUpdate: libraryUpdates.subscribe,
  openDataFolder: (): ReturnType<LumeApi["openDataFolder"]> =>
    ipcRenderer.invoke(lumeChannels.openDataFolder),
  rescanSource: (sourceId): ReturnType<LumeApi["rescanSource"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSource, sourceId),
  rescanSources: (): ReturnType<LumeApi["rescanSources"]> =>
    ipcRenderer.invoke(lumeChannels.rescanSources),
  removePlaylistTrack: (input): ReturnType<LumeApi["removePlaylistTrack"]> =>
    ipcRenderer.invoke(lumeChannels.removePlaylistTrack, input),
  setTrackLiked: (input): ReturnType<LumeApi["setTrackLiked"]> =>
    ipcRenderer.invoke(lumeChannels.setTrackLiked, input),
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
