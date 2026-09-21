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
  removePlaylistTrack,
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

const playlistTrackInputSchema = z.object({
  playlistId: rowIdSchema,
  trackId: rowIdSchema,
});

const playlistTrackRemovalSchema = z.object({
  playlistTrackId: rowIdSchema,
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

  handleTrusted(lumeChannels.createPlaylist, (_window, input) => {
    const playlist = createPlaylist(playlistCreationSchema.parse(input));

    return { library: getLibrarySnapshot(), playlist } satisfies PlaylistCreationResult;
  });

  handleTrusted(lumeChannels.createPlaylistFromTrack, (_window, trackId) => {
    return createPlaylistFromTrack(rowIdSchema.parse(trackId));
  });

  handleTrusted(lumeChannels.loadPlaylist, (_window, playlistId) => {
    return getPlaylist(rowIdSchema.parse(playlistId));
  });

  handleTrusted(lumeChannels.deletePlaylist, (_window, playlistId) => {
    deletePlaylist(rowIdSchema.parse(playlistId));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.addTrackToPlaylist, (_window, input) => {
    return addTrackToPlaylist(playlistTrackInputSchema.parse(input));
  });

  handleTrusted(lumeChannels.confirmAddTrackToPlaylist, (_window, input) => {
    return confirmAddTrackToPlaylist(playlistTrackInputSchema.parse(input));
  });

  handleTrusted(lumeChannels.removePlaylistTrack, (_window, input) => {
    removePlaylistTrack(playlistTrackRemovalSchema.parse(input));
  });

  handleTrusted(lumeChannels.enableSource, async (_window, input) => {
    const sourceId = rowIdSchema.parse(input);
    enableSource(sourceId);
    await scanSource(sourceId);

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.disableSource, (_window, input) => {
    disableSource(rowIdSchema.parse(input));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.forgetSource, (_window, input) => {
    forgetSource(rowIdSchema.parse(input));

    return getLibrarySnapshot();
  });

  handleTrusted(lumeChannels.rescanSource, async (_window, input) => {
    await scanSource(rowIdSchema.parse(input));

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
