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
  type PlaylistCreationInput,
  type PlaylistTrackInput,
  type PlaylistTrackRemovalInput,
  type SavedPlaybackSession,
  type TrackLikeInput,
} from "../shared/lib";
import {
  disableSource,
  enableSource,
  forgetSource,
  getLibrarySnapshotJson,
  getSources,
  saveSource,
  scanEnabledSources,
  scanSource,
  setTrackLiked,
} from "./library";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  removePlaylistTrack,
} from "./playlists";
import { loadPlaybackSession, savePlaybackPosition, savePlaybackSession } from "./playback-session";
import { isTrustedRendererEvent } from "./protocol";

const rowIdSchema = z.number("Invalid database ID").int().positive().safe();

const playlistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const playlistTrackInputSchema = z.object({
  playlistId: rowIdSchema,
  trackId: rowIdSchema,
}) satisfies z.ZodType<PlaylistTrackInput>;

const playlistTrackRemovalSchema = z.object({
  playlistTrackId: rowIdSchema,
  playlistId: rowIdSchema,
}) satisfies z.ZodType<PlaylistTrackRemovalInput>;

const trackLikeInputSchema = z.object({
  liked: z.boolean("Invalid track like input"),
  trackId: rowIdSchema,
}) satisfies z.ZodType<TrackLikeInput>;

const playbackPositionSchema = z.number().finite().nonnegative();

const playbackSessionSchema = z.object({
  payload: z.string().max(16_000_000),
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

      if (!folder) return getLibrarySnapshotJson();

      const source = await saveSource(folder);
      await scanSource(source.id);

      return getLibrarySnapshotJson();
    },
    addTrackToPlaylist: (_window, input) =>
      addTrackToPlaylist(playlistTrackInputSchema.parse(input)),
    confirmAddTrackToPlaylist: (_window, input) =>
      confirmAddTrackToPlaylist(playlistTrackInputSchema.parse(input)),
    createPlaylist: (_window, input) => {
      const playlist = createPlaylist(playlistCreationSchema.parse(input));

      return { library: getLibrarySnapshotJson(), playlist };
    },
    createPlaylistFromTrack: (_window, trackId) =>
      createPlaylistFromTrack(rowIdSchema.parse(trackId)),
    deletePlaylist: (_window, playlistId) => {
      deletePlaylist(rowIdSchema.parse(playlistId));

      return getLibrarySnapshotJson();
    },
    disableSource: (_window, input) => {
      disableSource(rowIdSchema.parse(input));

      return getLibrarySnapshotJson();
    },
    enableSource: async (_window, input) => {
      const sourceId = rowIdSchema.parse(input);
      enableSource(sourceId);
      await scanSource(sourceId);

      return getLibrarySnapshotJson();
    },
    forgetSource: (_window, input) => {
      forgetSource(rowIdSchema.parse(input));

      return getLibrarySnapshotJson();
    },
    loadLibrary: () => getLibrarySnapshotJson(),
    loadPlaybackSession: () => loadPlaybackSession(),
    loadPlaylist: (_window, playlistId) => getPlaylist(rowIdSchema.parse(playlistId)),
    openDataFolder: async () => {
      const errorMessage = await shell.openPath(options.userDataDirectory);

      if (errorMessage) throw new Error(errorMessage);
    },
    removePlaylistTrack: (_window, input) => {
      removePlaylistTrack(playlistTrackRemovalSchema.parse(input));
    },
    rescanSource: async (_window, input) => {
      await scanSource(rowIdSchema.parse(input));

      return getLibrarySnapshotJson();
    },
    rescanSources: async () => {
      await scanEnabledSources();

      return getLibrarySnapshotJson();
    },
    savePlaybackPosition: (_window, position) => {
      savePlaybackPosition(playbackPositionSchema.parse(position));
    },
    savePlaybackSession: (_window, session) => {
      savePlaybackSession(playbackSessionSchema.parse(session));
    },
    setTrackLiked: (_window, input) => setTrackLiked(trackLikeInputSchema.parse(input)),
  } satisfies LumeHandlers;

  for (const [method, channel] of Object.entries(lumeChannels)) {
    // SAFETY: `lumeChannels` and `handlers` both have exactly the keys of `LumeInvokeApi`.
    const handler = handlers[method as keyof LumeInvokeApi] as LumeHandlers[keyof LumeInvokeApi];

    ipcMain.handle(channel, (event, ...args) =>
      handler(requireTrustedWindow(event, options.rendererUrl), ...args),
    );
  }

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
