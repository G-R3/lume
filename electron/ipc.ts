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
  LUME_CHANNELS,
  LUME_EVENT_CHANNELS,
  type LumeInvokeApi,
  type SavedPlaybackSession,
} from "@shared/ipc";
import {
  type AddTracksToPlaylistInput,
  type PlaylistCreationInput,
  type RemovePlaylistTracksInput,
} from "@shared/library";
import {
  DatabaseIdSchema,
  DatabaseIdsSchema,
  PlaybackPositionSchema,
  PlaylistDuplicatesSchema,
  SetTracksLikedInputSchema,
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

const PlaylistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
    trackIds: DatabaseIdsSchema,
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const AddTracksToPlaylistSchema = z.object({
  duplicates: PlaylistDuplicatesSchema,
  playlistId: DatabaseIdSchema,
  trackIds: DatabaseIdsSchema.min(1),
}) satisfies z.ZodType<AddTracksToPlaylistInput>;

const RemovePlaylistTracksSchema = z.object({
  playlistTrackIds: DatabaseIdsSchema.min(1),
  playlistId: DatabaseIdSchema,
}) satisfies z.ZodType<RemovePlaylistTracksInput>;

const PlaybackSessionSchema = z.object({
  payload: z.string(),
  position: PlaybackPositionSchema,
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
      ...addTracksToPlaylist(AddTracksToPlaylistSchema.parse(input)),
      revision: currentLibraryRevision(),
    }),
    createPlaylist: (_window, input) => {
      const playlist = createPlaylist(PlaylistCreationSchema.parse(input));

      return { playlist, revision: currentLibraryRevision() };
    },
    deletePlaylist: (_window, playlistId) => {
      deletePlaylist(DatabaseIdSchema.parse(playlistId));

      return currentLibraryRevision();
    },
    disableSource: (_window, input) => {
      disableSource(DatabaseIdSchema.parse(input));

      return currentLibraryRevision();
    },
    enableSource: (_window, input) => {
      scanInBackground(enableSource(DatabaseIdSchema.parse(input)));

      return currentLibraryRevision();
    },
    forgetSource: (_window, input) => {
      forgetSource(DatabaseIdSchema.parse(input));

      return currentLibraryRevision();
    },
    hasTrackFile: (_window, trackId) => hasTrackFile(DatabaseIdSchema.parse(trackId)),
    loadLibrary: () => getLibrarySnapshotJson(),
    loadLibraryState: () => getLibraryState(),
    loadPlaybackSession: () => loadPlaybackSession(),
    loadPlaylist: (_window, playlistId) => getPlaylist(DatabaseIdSchema.parse(playlistId)),
    openDataFolder: async () => {
      const errorMessage = await shell.openPath(options.userDataDirectory);

      if (errorMessage) throw new Error(errorMessage);
    },
    removePlaylistTracks: (_window, input) => {
      removePlaylistTracks(RemovePlaylistTracksSchema.parse(input));

      return currentLibraryRevision();
    },
    rescanSource: (_window, input) => {
      scanInBackground(scanSource(DatabaseIdSchema.parse(input)));

      return currentLibraryRevision();
    },
    rescanSources: () => {
      scanInBackground(scanEnabledSources());

      return currentLibraryRevision();
    },
    savePlaybackPosition: (_window, position) => {
      savePlaybackPosition(PlaybackPositionSchema.parse(position));
    },
    savePlaybackSession: (_window, session) => {
      savePlaybackSession(PlaybackSessionSchema.parse(session));
    },
    setTracksLiked: (_window, input) => setTracksLiked(SetTracksLikedInputSchema.parse(input)),
  } satisfies LumeHandlers;

  for (const [method, channel] of Object.entries(LUME_CHANNELS)) {
    // SAFETY: `LUME_CHANNELS` and `handlers` both have exactly the keys of `LumeInvokeApi`.
    const handler = handlers[method as keyof LumeInvokeApi] as LumeHandlers[keyof LumeInvokeApi];

    ipcMain.handle(channel, (event, ...args) =>
      handler(requireTrustedWindow(event, options.rendererUrl), ...args),
    );
  }

  onLibraryEvent((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(LUME_EVENT_CHANNELS.libraryEvent, event);
    }
  });

  ipcMain.on(LUME_EVENT_CHANNELS.flushPlaybackSession, (event, session) => {
    try {
      requireTrustedWindow(event, options.rendererUrl);
      savePlaybackSession(PlaybackSessionSchema.parse(session));
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
