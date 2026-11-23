import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { LUME_CHANNELS, LUME_EVENT_CHANNELS, type LumeApi, type LumeInvokeApi } from "@shared/ipc";
import { type LibraryEvent } from "@shared/library";

// Forward only the first argument: TanStack calls a `mutationFn` with a second `context` argument.
// SAFETY: one entry per `LUME_CHANNELS` key, and `LUME_CHANNELS` has exactly the keys of `LumeInvokeApi`.
const invokeApi = Object.fromEntries(
  Object.entries(LUME_CHANNELS).map(([method, channel]) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel, args[0]),
  ]),
) as LumeInvokeApi;

const { loadPlaybackSession, savePlaybackPosition, savePlaybackSession, ...methods } = invokeApi;

const lumeApi = {
  ...methods,
  playbackSession: {
    flush: (session) => {
      const result: unknown = ipcRenderer.sendSync(
        LUME_EVENT_CHANNELS.flushPlaybackSession,
        session,
      );

      if (result !== true) throw new Error("Could not save playback");
    },
    load: loadPlaybackSession,
    save: savePlaybackSession,
    savePosition: savePlaybackPosition,
  },
  isMac: process.platform === "darwin",
  onLibraryEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, libraryEvent: LibraryEvent) =>
      listener(libraryEvent);

    ipcRenderer.on(LUME_EVENT_CHANNELS.libraryEvent, forward);

    return () => {
      ipcRenderer.removeListener(LUME_EVENT_CHANNELS.libraryEvent, forward);
    };
  },
} satisfies LumeApi;

contextBridge.exposeInMainWorld("lume", lumeApi);
