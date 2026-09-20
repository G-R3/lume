import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  lumeChannels,
  type LibrarySnapshot,
  type PlaylistCreationInput,
  type PlaylistCreationResult,
} from "../shared/lib";
import { getDatabase } from "./database";
import { scanEnabledSources, scanSource } from "./library-scan";
import {
  disableSource,
  enableSource,
  forgetSource,
  getSources,
  hasForgottenSources,
  saveSource,
} from "./library-store";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistEntry,
} from "./playlist-store";
import { getArtworkUrl, getTrackUrl, isTrustedRendererEvent } from "./protocol";
import { getTracks } from "./track-store";

const sourceIdSchema = z.uuidv4("Invalid library source ID");

const trackIdSchema = z.uuidv4("Invalid track ID");

const playlistIdSchema = z.uuidv4("Invalid playlist ID");

const playlistEntryIdSchema = z.uuidv4("Invalid playlist entry ID");

const playlistCreationSchema = z.object(
  {
    description: z.string("Invalid playlist creation input").nullable(),
    title: z.string("Invalid playlist creation input"),
  },
  "Invalid playlist creation input",
) satisfies z.ZodType<PlaylistCreationInput>;

const playlistTrackSchema = z.object({
  playlistId: playlistIdSchema,
  trackId: trackIdSchema,
});

const playlistEntrySchema = z.object({
  entryId: playlistEntryIdSchema,
  playlistId: playlistIdSchema,
});

export function registerIpc(options: { rendererUrl: string; userDataDirectory: string }) {
  const database = getDatabase();

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
      defaultPath: getSources(database).at(-1)?.path,
      properties: ["openDirectory"],
    });

    const folder = result.filePaths[0];

    if (!folder) return readLibrary();

    const source = await saveSource(database, folder);
    await scanSource(database, source.id);

    return readLibrary();
  });

  handleTrusted(lumeChannels.loadLibrary, () => readLibrary());

  handleTrusted(lumeChannels.createPlaylist, (_window, rawInput) => {
    const playlist = createPlaylist(database, playlistCreationSchema.parse(rawInput));

    return { library: readLibrary(), playlist } satisfies PlaylistCreationResult;
  });

  handleTrusted(lumeChannels.createPlaylistFromTrack, (_window, rawTrackId) => {
    return createPlaylistFromTrack(database, trackIdSchema.parse(rawTrackId));
  });

  handleTrusted(lumeChannels.loadPlaylist, (_window, rawPlaylistId) => {
    return getPlaylist(database, playlistIdSchema.parse(rawPlaylistId));
  });

  handleTrusted(lumeChannels.deletePlaylist, (_window, rawPlaylistId) => {
    deletePlaylist(database, playlistIdSchema.parse(rawPlaylistId));

    return readLibrary();
  });

  handleTrusted(lumeChannels.addTrackToPlaylist, (_window, rawPlaylistId, rawTrackId) => {
    const input = playlistTrackSchema.parse({
      playlistId: rawPlaylistId,
      trackId: rawTrackId,
    });

    return addTrackToPlaylist(database, input.playlistId, input.trackId);
  });

  handleTrusted(lumeChannels.confirmAddTrackToPlaylist, (_window, rawPlaylistId, rawTrackId) => {
    const input = playlistTrackSchema.parse({
      playlistId: rawPlaylistId,
      trackId: rawTrackId,
    });

    return confirmAddTrackToPlaylist(database, input.playlistId, input.trackId);
  });

  handleTrusted(lumeChannels.removePlaylistEntry, (_window, rawPlaylistId, rawEntryId) => {
    const input = playlistEntrySchema.parse({
      entryId: rawEntryId,
      playlistId: rawPlaylistId,
    });

    removePlaylistEntry(database, input.playlistId, input.entryId);
  });

  handleTrusted(lumeChannels.enableSource, async (_window, rawSourceId) => {
    const sourceId = sourceIdSchema.parse(rawSourceId);
    enableSource(database, sourceId);
    await scanSource(database, sourceId);

    return readLibrary();
  });

  handleTrusted(lumeChannels.disableSource, (_window, rawSourceId) => {
    disableSource(database, sourceIdSchema.parse(rawSourceId));

    return readLibrary();
  });

  handleTrusted(lumeChannels.forgetSource, (_window, rawSourceId) => {
    forgetSource(database, sourceIdSchema.parse(rawSourceId));

    return readLibrary();
  });

  handleTrusted(lumeChannels.rescanSource, async (_window, rawSourceId) => {
    await scanSource(database, sourceIdSchema.parse(rawSourceId));

    return readLibrary();
  });

  handleTrusted(lumeChannels.rescanSources, async () => {
    await scanEnabledSources(database);

    return readLibrary();
  });
}

export function readLibrary() {
  const database = getDatabase();
  const sources = getSources(database);
  const storedTracks = getTracks(database);

  if (sources.length === 0 && !hasForgottenSources(database)) {
    return { kind: "first-run" } satisfies LibrarySnapshot;
  }

  return {
    kind: "library",
    playlists: getPlaylists(database),
    sources,
    tracks: storedTracks.map((track) => {
      const artists = track.artists.length > 0 ? track.artists : ["Unknown artist"];

      return {
        album: track.album ?? "Unknown album",
        albumArtists: track.albumArtists.length > 0 ? track.albumArtists : artists,
        artists,
        artworkUrl: track.artworkId ? getArtworkUrl(track.artworkId) : null,
        available: track.available,
        bitrate: track.bitrate,
        bitsPerSample: track.bitsPerSample,
        channelCount: track.channelCount,
        codec: track.codec,
        discNumber: track.discNumber,
        discTotal: track.discTotal,
        duration: track.duration,
        format: track.format,
        genres: track.genres,
        id: track.id,
        lossless: track.lossless,
        title: track.title,
        sampleRate: track.sampleRate,
        trackNumber: track.trackNumber,
        trackTotal: track.trackTotal,
        url: getTrackUrl(track.id),
        year: track.year,
      };
    }),
  } satisfies LibrarySnapshot;
}

function requireTrustedWindow(event: IpcMainInvokeEvent, rendererUrl: string) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed() || !isTrustedRendererEvent(event, rendererUrl)) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }

  return window;
}
