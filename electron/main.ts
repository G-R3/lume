import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import {
  appScheme,
  getArtworkUrl,
  getTrackUrl,
  isTrustedRendererEvent,
  loadRenderer,
  packagedRendererUrl,
  registerProtocolHandler,
} from "./protocol";
import {
  lumeChannels,
  type LibrarySnapshot,
  type PlaylistCreationInput,
  type PlaylistCreationResult,
} from "../shared/lib";
import {
  closeDatabase,
  getDatabase,
  getLibraryDatabasePath,
  initializeDatabase,
  type LibraryDatabase,
} from "./database";
import { scanEnabledSources, scanSource } from "./library-scan";
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
import {
  disableSource,
  enableSource,
  forgetSource,
  hasForgottenSources,
  getSources,
  saveSource,
} from "./library-store";
import { getArtworkData, getTrackPath, getTracks } from "./track-store";

app.enableSandbox();

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

const rendererDirectory = join(__dirname, "../renderer");

const rendererUrl =
  !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : packagedRendererUrl;

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000000",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
    },
  });

  loadRenderer(window, rendererUrl);

  return window;
}

void startPrimaryInstance().catch(handleStartupFailure);

async function startPrimaryInstance() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();

    return;
  }

  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) return;

    if (window.isMinimized()) window.restore();
    window.focus();
  });

  await app.whenReady();
  await startApplication();
}

async function startApplication() {
  const userDataDirectory = app.getPath("userData");
  await initializeDatabase({
    location: getLibraryDatabasePath(userDataDirectory, app.isPackaged),
  });
  const database = getDatabase();

  app.once("will-quit", closeDatabase);

  registerLibraryIpc(database, userDataDirectory);

  registerProtocolHandler(
    rendererDirectory,
    (trackId) => getTrackPath(database, trackId),
    (artworkId) => getArtworkData(database, artworkId),
  );

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );

  const window = createWindow();

  void scanEnabledSources(database)
    .then(() => {
      if (!window.isDestroyed()) {
        window.webContents.send(lumeChannels.libraryUpdated, readLibrary(database));
      }
    })
    .catch((error) => console.error("Could not scan the music library", error));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function registerLibraryIpc(database: LibraryDatabase, userDataDirectory: string) {
  ipcMain.handle(lumeChannels.openDataFolder, async (event) => {
    requireTrustedWindow(event);
    const errorMessage = await shell.openPath(userDataDirectory);

    if (errorMessage) throw new Error(errorMessage);
  });

  ipcMain.handle(lumeChannels.addSource, async (event) => {
    const window = requireTrustedWindow(event);

    const result = await dialog.showOpenDialog(window, {
      title: "Add a music source",
      buttonLabel: "Add Source",
      defaultPath: getSources(database).at(-1)?.path,
      properties: ["openDirectory"],
    });

    const folder = result.filePaths[0];

    if (!folder) return readLibrary(database);

    const source = await saveSource(database, folder);
    await scanSource(database, source.id);

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.loadLibrary, (event) => {
    requireTrustedWindow(event);

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.createPlaylist, (event, input) => {
    requireTrustedWindow(event);
    const playlist = createPlaylist(database, requirePlaylistCreationInput(input));

    return { library: readLibrary(database), playlist } satisfies PlaylistCreationResult;
  });

  ipcMain.handle(lumeChannels.createPlaylistFromTrack, (event, trackId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(trackId)) throw new Error("Invalid track ID");

    return createPlaylistFromTrack(database, trackId);
  });

  ipcMain.handle(lumeChannels.loadPlaylist, (event, playlistId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(playlistId)) throw new Error("Invalid playlist ID");

    return getPlaylist(database, playlistId);
  });

  ipcMain.handle(lumeChannels.deletePlaylist, (event, playlistId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(playlistId)) throw new Error("Invalid playlist ID");
    deletePlaylist(database, playlistId);

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.addTrackToPlaylist, (event, playlistId, trackId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(playlistId)) throw new Error("Invalid playlist ID");

    if (!uuidPattern.test(trackId)) throw new Error("Invalid track ID");

    return addTrackToPlaylist(database, playlistId, trackId);
  });

  ipcMain.handle(lumeChannels.confirmAddTrackToPlaylist, (event, playlistId, trackId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(playlistId)) throw new Error("Invalid playlist ID");

    if (!uuidPattern.test(trackId)) throw new Error("Invalid track ID");

    return confirmAddTrackToPlaylist(database, playlistId, trackId);
  });

  ipcMain.handle(lumeChannels.removePlaylistEntry, (event, playlistId, entryId) => {
    requireTrustedWindow(event);

    if (!uuidPattern.test(playlistId)) throw new Error("Invalid playlist ID");

    if (!uuidPattern.test(entryId)) throw new Error("Invalid playlist entry ID");
    removePlaylistEntry(database, playlistId, entryId);
  });

  ipcMain.handle(lumeChannels.enableSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    const parsedSourceId = requireSourceId(sourceId);
    enableSource(database, parsedSourceId);
    await scanSource(database, parsedSourceId);

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.disableSource, (event, sourceId) => {
    requireTrustedWindow(event);
    disableSource(database, requireSourceId(sourceId));

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.forgetSource, (event, sourceId) => {
    requireTrustedWindow(event);
    forgetSource(database, requireSourceId(sourceId));

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.rescanSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    await scanSource(database, requireSourceId(sourceId));

    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.rescanSources, async (event) => {
    requireTrustedWindow(event);
    await scanEnabledSources(database);

    return readLibrary(database);
  });
}

function readLibrary(database: LibraryDatabase) {
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function requireTrustedWindow(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed() || !isTrustedRendererEvent(event, rendererUrl)) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }

  return window;
}

function requireSourceId(sourceId: string) {
  if (uuidPattern.test(sourceId)) return sourceId;
  throw new Error("Invalid library source ID");
}

function requirePlaylistCreationInput(input: PlaylistCreationInput) {
  if (
    input === null ||
    Array.isArray(input) ||
    Object.prototype.toString.call(input) !== "[object Object]" ||
    Object.prototype.toString.call(input.title) !== "[object String]" ||
    (input.description !== null &&
      Object.prototype.toString.call(input.description) !== "[object String]")
  ) {
    throw new Error("Invalid playlist creation input");
  }

  return input;
}

async function handleStartupFailure(error: Error) {
  if (app.isPackaged) console.error("Lume could not start");
  else console.error("Lume could not start", error);

  const response = dialog.showMessageBoxSync({
    buttons: ["Open data folder", "Quit"],
    cancelId: 1,
    defaultId: 1,
    ...(!app.isPackaged && {
      detail: error.message,
    }),
    message: "Lume encountered a problem while starting.",
    title: "Lume could not start",
    type: "error",
  });

  if (response === 0) {
    const openError = await shell.openPath(app.getPath("userData"));

    if (openError) dialog.showErrorBox("Lume could not open its data folder", openError);
  }

  app.quit();
}
