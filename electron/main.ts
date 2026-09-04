import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
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
  getTrackUrl,
  isTrustedRendererEvent,
  loadRenderer,
  packagedRendererUrl,
  registerProtocolHandler,
} from "./protocol";
import { lumeChannels, type LibrarySnapshot, type PlaylistCreationInput } from "../shared/lib";
import { getLibraryDatabasePath, openLibraryDatabase } from "./database";
import { scanEnabledSources, scanSource } from "./library-scan";
import { createPlaylist, deletePlaylist, getPlaylists } from "./playlist-store";
import {
  disableSource,
  enableSource,
  forgetSource,
  hasForgottenSources,
  getSources,
  getTrackPath,
  getTracks,
  saveSource,
} from "./library-store";

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
const sourceIdPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;

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
  const databasePath = getLibraryDatabasePath(userDataDirectory, app.isPackaged);
  const database = await openLibraryDatabase(databasePath);
  app.once("will-quit", () => {
    if (database.isOpen) database.close();
  });
  registerLibraryIpc(database, userDataDirectory);

  registerProtocolHandler(rendererDirectory, (trackId) => getTrackPath(database, trackId));

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

function registerLibraryIpc(database: DatabaseSync, userDataDirectory: string) {
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
    createPlaylist(database, requirePlaylistCreationInput(input));
    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.deletePlaylist, (event, playlistId) => {
    requireTrustedWindow(event);
    deletePlaylist(database, playlistId);
    return readLibrary(database);
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

function readLibrary(database: DatabaseSync) {
  const sources = getSources(database);
  const storedTracks = getTracks(database);

  if (sources.length === 0 && !hasForgottenSources(database)) {
    return { kind: "first-run" } satisfies LibrarySnapshot;
  }

  return {
    kind: "library",
    playlists: getPlaylists(database),
    sources,
    tracks: storedTracks.map((track) => ({
      available: track.available,
      duration: track.duration,
      format: track.format,
      id: track.id,
      name: track.name,
      url: getTrackUrl(track.id),
    })),
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
  if (sourceIdPattern.test(sourceId)) return sourceId;
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

  const title = input.title.trim();
  const description = input.description?.trim() ? input.description : null;

  if (title.length === 0 || title.length > 100) {
    throw new Error("Playlist titles must contain between 1 and 100 characters");
  }

  if (description !== null && description.length > 300) {
    throw new Error("Playlist descriptions cannot exceed 300 characters");
  }

  return { description, title } satisfies PlaylistCreationInput;
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
