import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  lumeChannels,
  type PlaylistCreationInput,
  type PlaylistCreationResult,
} from "../shared/lib";
import {
  disableSource,
  enableSource,
  forgetSource,
  getLibrarySnapshot,
  getSources,
  saveSource,
  scanEnabledSources,
  scanSource,
} from "./library";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  removePlaylistEntry,
} from "./playlists";
import { isTrustedRendererEvent } from "./protocol";

const rowIdSchema = z.number("Invalid database ID").int().positive().safe();

const playlistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const playlistTrackSchema = z.object({
  playlistId: rowIdSchema,
  trackId: rowIdSchema,
});

const playlistEntrySchema = z.object({
  entryId: rowIdSchema,
  playlistId: rowIdSchema,
});

export function registerIpc(options: { rendererUrl: string; userDataDirectory: string }) {
  function handleTrusted<Result>(
    channel: string,
    handler: (window: BrowserWindow, ...args: unknown[]) => Result,
  ) {
    ipcMain.handle(channel, (event, ...args) => {
      return handler(requireTrustedWindow(event, options.rendererUrl), ...args);
    });
  }

  handleTrusted(lumeChannels.openDataFolder, async () => {
    const errorMessage = await shell.openPath(options.userDataDirectory);

    if (errorMessage) throw new Error(errorMessage);
  });

  handleTrusted(lumeChannels.addSource, async (window) => {
    const result = await dialog.showOpenDialog(window, {
      title: "Add a music source",
      buttonLabel: "Add Source",
      defaultPath: getSources().at(-1)?.path,
      properties: ["openDirectory"],
    });

    const folder = result.filePaths[0];

    if (!folder) return getLibrarySnapshot();

    const source = await saveSource(folder);
    await scanSource(source.id);

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.loadLibrary, () => getLibrarySnapshot());

  handleTrusted(lumeChannels.createPlaylist, (_window, rawInput) => {
    const playlist = createPlaylist(playlistCreationSchema.parse(rawInput));

    return { library: getLibrarySnapshot(), playlist } satisfies PlaylistCreationResult;
  });

  handleTrusted(lumeChannels.createPlaylistFromTrack, (_window, rawTrackId) => {
    return createPlaylistFromTrack(rowIdSchema.parse(rawTrackId));
  });

  handleTrusted(lumeChannels.loadPlaylist, (_window, rawPlaylistId) => {
    return getPlaylist(rowIdSchema.parse(rawPlaylistId));
  });

  handleTrusted(lumeChannels.deletePlaylist, (_window, rawPlaylistId) => {
    deletePlaylist(rowIdSchema.parse(rawPlaylistId));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.addTrackToPlaylist, (_window, rawPlaylistId, rawTrackId) => {
    const input = playlistTrackSchema.parse({
      playlistId: rawPlaylistId,
      trackId: rawTrackId,
    });

    return addTrackToPlaylist(input.playlistId, input.trackId);
  });

  handleTrusted(lumeChannels.confirmAddTrackToPlaylist, (_window, rawPlaylistId, rawTrackId) => {
    const input = playlistTrackSchema.parse({
      playlistId: rawPlaylistId,
      trackId: rawTrackId,
    });

    return confirmAddTrackToPlaylist(input.playlistId, input.trackId);
  });

  handleTrusted(lumeChannels.removePlaylistEntry, (_window, rawPlaylistId, rawEntryId) => {
    const input = playlistEntrySchema.parse({
      entryId: rawEntryId,
      playlistId: rawPlaylistId,
    });

    removePlaylistEntry(input.playlistId, input.entryId);
  });

  handleTrusted(lumeChannels.enableSource, async (_window, rawSourceId) => {
    const sourceId = rowIdSchema.parse(rawSourceId);
    enableSource(sourceId);
    await scanSource(sourceId);

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.disableSource, (_window, rawSourceId) => {
    disableSource(rowIdSchema.parse(rawSourceId));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.forgetSource, (_window, rawSourceId) => {
    forgetSource(rowIdSchema.parse(rawSourceId));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.rescanSource, async (_window, rawSourceId) => {
    await scanSource(rowIdSchema.parse(rawSourceId));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.rescanSources, async () => {
    await scanEnabledSources();

    return getLibrarySnapshot();
  });
}

function requireTrustedWindow(event: IpcMainInvokeEvent, rendererUrl: string) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed() || !isTrustedRendererEvent(event, rendererUrl)) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }

  return window;
}
