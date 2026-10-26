import { contextBridge, ipcRenderer } from "electron";
import {
  createBufferedListeners,
  lumeChannels,
  lumeEventChannels,
  type LibraryUpdate,
  type LumeApi,
  type LumeInvokeApi,
} from "../shared/lib";

const libraryUpdates = createBufferedListeners<LibraryUpdate>();

ipcRenderer.on(lumeEventChannels.libraryUpdated, (_event, update: LibraryUpdate) => {
  libraryUpdates.publish(update);
});

// Forward only the first argument: TanStack calls a `mutationFn` with a second `context` argument.
// SAFETY: one entry per `lumeChannels` key, and `lumeChannels` has exactly the keys of `LumeInvokeApi`.
const invokeApi = Object.fromEntries(
  Object.entries(lumeChannels).map(([method, channel]) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel, args[0]),
  ]),
) as LumeInvokeApi;

const { loadPlaybackSession, savePlaybackPosition, savePlaybackSession, ...methods } = invokeApi;

const lumeApi = {
  ...methods,
  playbackSession: {
    flush: (session) => {
      const result: unknown = ipcRenderer.sendSync(lumeEventChannels.flushPlaybackSession, session);

      if (result !== true) throw new Error("Could not save playback");
    },
    load: loadPlaybackSession,
    save: savePlaybackSession,
    savePosition: savePlaybackPosition,
  },
  onLibraryUpdate: libraryUpdates.subscribe,
  isMac: process.platform === "darwin",
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
