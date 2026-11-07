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
  type AddTracksToPlaylistInput,
  type LumeInvokeApi,
  type PlaylistCreationInput,
  type RemovePlaylistTracksInput,
  type SavedPlaybackSession,
  type SetTracksLikedInput,
} from "../shared/lib";
import {
  disableSource,
  enableSource,
  forgetSource,
  getLibrarySnapshotJson,
  getLibraryUpdate,
  type LibraryScanResult,
  getSources,
  hasTrackFile,
  saveSource,
  scanEnabledSources,
  scanSource,
  setTracksLiked,
} from "./library";
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  removePlaylistTracks,
} from "./playlists";
import { loadPlaybackSession, savePlaybackPosition, savePlaybackSession } from "./playback-session";
import { isTrustedRendererEvent } from "./protocol";

const rowIdSchema = z.number("Invalid database ID").int().positive().safe();

const rowIdsSchema = z.array(rowIdSchema, "Invalid database IDs");

const playlistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
    trackIds: rowIdsSchema,
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const addTracksToPlaylistSchema = z.object({
  duplicates: z.enum(["check", "allow", "skip"]),
  playlistId: rowIdSchema,
  trackIds: rowIdsSchema.min(1),
}) satisfies z.ZodType<AddTracksToPlaylistInput>;

const removePlaylistTracksSchema = z.object({
  playlistTrackIds: rowIdsSchema.min(1),
  playlistId: rowIdSchema,
}) satisfies z.ZodType<RemovePlaylistTracksInput>;

const setTracksLikedSchema = z.object({
  liked: z.boolean("Invalid track like input"),
  trackIds: rowIdsSchema.min(1),
}) satisfies z.ZodType<SetTracksLikedInput>;

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

export function registerIpc(options: {
  rendererUrl: string;
  startupScan: Promise<LibraryScanResult>;
  userDataDirectory: string;
}) {
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
    addTracksToPlaylist: (_window, input) =>
      addTracksToPlaylist(addTracksToPlaylistSchema.parse(input)),
    // Computed after the scan settles and sent like every other reply, so it is ordered with them.
    // A failed scan may have committed some sources first, so it replies with the whole stored library.
    awaitStartupScan: () =>
      options.startupScan.catch(() => "changed" as const).then(getLibraryUpdate),
    createPlaylist: (_window, input) => {
      const playlist = createPlaylist(playlistCreationSchema.parse(input));

      return { library: getLibrarySnapshotJson(), playlist };
    },
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
    hasTrackFile: (_window, trackId) => hasTrackFile(rowIdSchema.parse(trackId)),
    loadLibrary: () => getLibrarySnapshotJson(),
    loadPlaybackSession: () => loadPlaybackSession(),
    loadPlaylist: (_window, playlistId) => getPlaylist(rowIdSchema.parse(playlistId)),
    openDataFolder: async () => {
      const errorMessage = await shell.openPath(options.userDataDirectory);

      if (errorMessage) throw new Error(errorMessage);
    },
    removePlaylistTracks: (_window, input) => {
      removePlaylistTracks(removePlaylistTracksSchema.parse(input));
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
    setTracksLiked: (_window, input) => setTracksLiked(setTracksLikedSchema.parse(input)),
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
