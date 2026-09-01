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
import { lumeChannels, type MusicLibrary } from "../shared/lib";
import { getLibraryDatabasePath, openLibraryDatabase } from "./database";
import { scanEnabledSources, scanSource } from "./library-scan";
import {
  disableSource,
  enableSource,
  forgetSource,
  hasForgottenSources,
  getSources,
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
let tracksById = new Map<string, string>();

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

void app.whenReady().then(startApplication).catch(handleStartupFailure);

async function startApplication() {
  const userDataDirectory = app.getPath("userData");
  const databasePath = getLibraryDatabasePath(userDataDirectory, app.isPackaged);
  const database = await openLibraryDatabase(databasePath);
  app.once("will-quit", () => {
    if (database.isOpen) database.close();
  });
  registerLibraryIpc(database, userDataDirectory);

  registerProtocolHandler(rendererDirectory, () => tracksById);

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

  ipcMain.handle(lumeChannels.enableSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    enableSource(database, sourceId);
    await scanSource(database, sourceId);
    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.disableSource, (event, sourceId) => {
    requireTrustedWindow(event);
    disableSource(database, sourceId);
    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.forgetSource, (event, sourceId) => {
    requireTrustedWindow(event);
    forgetSource(database, sourceId);
    return readLibrary(database);
  });

  ipcMain.handle(lumeChannels.rescanSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    await scanSource(database, sourceId);
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
  const storedTracks = refreshTracksById(database);

  if (sources.length === 0 && !hasForgottenSources(database)) return null;

  return {
    sources,
    tracks: storedTracks.map((track) => ({
      available: track.available,
      duration: track.duration,
      format: track.format,
      id: track.id,
      name: track.name,
      url: getTrackUrl(track.id),
    })),
  } satisfies MusicLibrary;
}

function refreshTracksById(database: DatabaseSync) {
  const tracks = getTracks(database);
  tracksById = new Map(tracks.map((track) => [track.id, track.path]));
  return tracks;
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

async function handleStartupFailure(error: Error) {
  console.error("Lume could not open its database", error);

  const response = dialog.showMessageBoxSync({
    buttons: ["Open data folder", "Quit"],
    cancelId: 1,
    defaultId: 1,
    detail: error.message,
    message: "Lume could not open its database.",
    title: "Lume could not start",
    type: "error",
  });

  if (response === 0) {
    const openError = await shell.openPath(app.getPath("userData"));
    if (openError) dialog.showErrorBox("Lume could not open its data folder", openError);
  }

  app.quit();
}
