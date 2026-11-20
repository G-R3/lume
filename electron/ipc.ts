import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { z } from "zod";
import {
  lumeChannels,
  lumeEventChannels,
  type LumeInvokeApi,
  type SavedPlaybackSession,
} from "@shared/ipc";
import {
  type AddTracksToPlaylistInput,
  type PlaylistCreationInput,
  type RemovePlaylistTracksInput,
} from "@shared/library";
import {
  databaseIdSchema,
  databaseIdsSchema,
  playbackPositionSchema,
  playlistDuplicatesSchema,
  setTracksLikedInputSchema,
} from "@shared/schemas";
import {
  disableSource,
  enableSource,
  forgetSource,
  getLibrarySnapshotJson,
  getSources,
  hasTrackFile,
  saveSource,
  scanEnabledSources,
  scanInBackground,
  scanSource,
  setTracksLiked,
} from "./library";
import { currentLibraryRevision, getLibraryState, onLibraryEvent } from "./library-events";
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  removePlaylistTracks,
} from "./playlists";
import { loadPlaybackSession, savePlaybackPosition, savePlaybackSession } from "./playback-session";
import { isTrustedRendererEvent } from "./protocol";

const playlistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
    trackIds: databaseIdsSchema,
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const addTracksToPlaylistSchema = z.object({
  duplicates: playlistDuplicatesSchema,
  playlistId: databaseIdSchema,
  trackIds: databaseIdsSchema.min(1),
}) satisfies z.ZodType<AddTracksToPlaylistInput>;

const removePlaylistTracksSchema = z.object({
  playlistTrackIds: databaseIdsSchema.min(1),
  playlistId: databaseIdSchema,
}) satisfies z.ZodType<RemovePlaylistTracksInput>;

const playbackSessionSchema = z.object({
  payload: z.string(),
  position: playbackPositionSchema,
}) satisfies z.ZodType<SavedPlaybackSession>;

type LumeHandlers = {
  [Method in keyof LumeInvokeApi]: (
    window: BrowserWindow,
    ...args: unknown[]
  ) => ReturnType<LumeInvokeApi[Method]> | Awaited<ReturnType<LumeInvokeApi[Method]>>;
};

export function registerIpc(options: { rendererUrl: string; userDataDirectory: string }) {
  const handlers = {
    addSource: async (window) => {
      const result = await dialog.showOpenDialog(window, {
        title: "Add a music source",
        buttonLabel: "Add Source",
        defaultPath: getSources().at(-1)?.path,
        properties: ["openDirectory"],
      });

      const folder = result.filePaths[0];

      if (folder) scanInBackground(scanSource((await saveSource(folder)).id));

      return currentLibraryRevision();
    },
    addTracksToPlaylist: (_window, input) => ({
      ...addTracksToPlaylist(addTracksToPlaylistSchema.parse(input)),
      revision: currentLibraryRevision(),
    }),
    createPlaylist: (_window, input) => {
      const playlist = createPlaylist(playlistCreationSchema.parse(input));

      return { playlist, revision: currentLibraryRevision() };
    },
    deletePlaylist: (_window, playlistId) => {
      deletePlaylist(databaseIdSchema.parse(playlistId));

      return currentLibraryRevision();
    },
    disableSource: (_window, input) => {
      disableSource(databaseIdSchema.parse(input));

      return currentLibraryRevision();
    },
    enableSource: (_window, input) => {
      scanInBackground(enableSource(databaseIdSchema.parse(input)));

      return currentLibraryRevision();
    },
    forgetSource: (_window, input) => {
      forgetSource(databaseIdSchema.parse(input));

      return currentLibraryRevision();
    },
    hasTrackFile: (_window, trackId) => hasTrackFile(databaseIdSchema.parse(trackId)),
    loadLibrary: () => getLibrarySnapshotJson(),
    loadLibraryState: () => getLibraryState(),
    loadPlaybackSession: () => loadPlaybackSession(),
    loadPlaylist: (_window, playlistId) => getPlaylist(databaseIdSchema.parse(playlistId)),
    openDataFolder: async () => {
      const errorMessage = await shell.openPath(options.userDataDirectory);

      if (errorMessage) throw new Error(errorMessage);
    },
    removePlaylistTracks: (_window, input) => {
      removePlaylistTracks(removePlaylistTracksSchema.parse(input));

      return currentLibraryRevision();
    },
    rescanSource: (_window, input) => {
      scanInBackground(scanSource(databaseIdSchema.parse(input)));

      return currentLibraryRevision();
    },
    rescanSources: () => {
      scanInBackground(scanEnabledSources());

      return currentLibraryRevision();
    },
    savePlaybackPosition: (_window, position) => {
      savePlaybackPosition(playbackPositionSchema.parse(position));
    },
    savePlaybackSession: (_window, session) => {
      savePlaybackSession(playbackSessionSchema.parse(session));
    },
    setTracksLiked: (_window, input) => setTracksLiked(setTracksLikedInputSchema.parse(input)),
  } satisfies LumeHandlers;

  for (const [method, channel] of Object.entries(lumeChannels)) {
    // SAFETY: `lumeChannels` and `handlers` both have exactly the keys of `LumeInvokeApi`.
    const handler = handlers[method as keyof LumeInvokeApi] as LumeHandlers[keyof LumeInvokeApi];

    ipcMain.handle(channel, (event, ...args) =>
      handler(requireTrustedWindow(event, options.rendererUrl), ...args),
    );
  }

  onLibraryEvent((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(lumeEventChannels.libraryEvent, event);
    }
  });

  ipcMain.on(lumeEventChannels.flushPlaybackSession, (event, session) => {
    try {
      requireTrustedWindow(event, options.rendererUrl);
      savePlaybackSession(playbackSessionSchema.parse(session));
      event.returnValue = true;
    } catch (error) {
      event.returnValue = error instanceof Error ? error.message : "Could not save playback";
    }
  });
}

function requireTrustedWindow(event: IpcMainEvent | IpcMainInvokeEvent, rendererUrl: string) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed() || !isTrustedRendererEvent(event, rendererUrl)) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }

  return window;
}
