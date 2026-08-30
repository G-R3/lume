import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
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
import { lumeChannels, type LibraryUpdate, type MusicLibrary } from "../shared/lib";
import { createMigrationBackup, getLibraryBackupDirectory } from "./database/backup";
import { getLibraryDatabasePath, openLibraryDatabase } from "./database";
import { scanEnabledSources, scanSource } from "./library-scan";
import {
  disableSource,
  enableSource,
  forgetSource,
  hasForgottenSources,
  getSources,
  getSource,
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
  const database = await openLibraryDatabase(
    getLibraryDatabasePath(userDataDirectory, app.isPackaged),
    {
      beforeMigrations: (database) =>
        createMigrationBackup(
          database,
          getLibraryBackupDirectory(userDataDirectory, app.isPackaged),
        ),
    },
  );
  app.once("will-quit", () => database.close());
  registerLibraryIpc(database);

  registerProtocolHandler(rendererDirectory, () => tracksById);

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );

  const window = createWindow();
  void scanEnabledSources(database)
    .then((scanFailures) => {
      const update = { library: readLibrary(database), scanFailures } satisfies LibraryUpdate;
      if (!window.isDestroyed()) window.webContents.send(lumeChannels.libraryUpdated, update);
    })
    .catch((error) => console.error("Could not scan the music library", error));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function registerLibraryIpc(database: DatabaseSync) {
  ipcMain.handle(lumeChannels.addSource, async (event) => {
    const window = requireTrustedWindow(event);
    const result = await dialog.showOpenDialog(window, {
      title: "Add a music source",
      buttonLabel: "Add Source",
      defaultPath: getSources(database).at(-1)?.path,
      properties: ["openDirectory"],
    });

    const folder = result.filePaths[0];
    if (!folder) return { library: readLibrary(database), scanFailures: [] };

    const source = await saveSource(database, folder);
    await rm(join(app.getPath("userData"), "music-folder"), { force: true }).catch((error: Error) =>
      console.warn("Could not remove the old music folder setting", error),
    );
    const failure = await scanSource(database, source);
    return { library: readLibrary(database), scanFailures: failure ? [failure] : [] };
  });

  ipcMain.handle(lumeChannels.loadLibrary, (event) => {
    requireTrustedWindow(event);
    return { library: readLibrary(database), scanFailures: [] };
  });

  ipcMain.handle(lumeChannels.enableSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    enableSource(database, sourceId);
    const failure = await scanSource(database, getSource(database, sourceId));

    return { library: readLibrary(database), scanFailures: failure ? [failure] : [] };
  });

  ipcMain.handle(lumeChannels.disableSource, (event, sourceId) => {
    requireTrustedWindow(event);
    disableSource(database, sourceId);
    return { library: readLibrary(database), scanFailures: [] };
  });

  ipcMain.handle(lumeChannels.forgetSource, (event, sourceId) => {
    requireTrustedWindow(event);
    forgetSource(database, sourceId);
    return { library: readLibrary(database), scanFailures: [] };
  });

  ipcMain.handle(lumeChannels.rescanSource, async (event, sourceId) => {
    requireTrustedWindow(event);
    const source = getSource(database, sourceId);

    if (!source.enabled) throw new Error(`Library source ${sourceId} is disabled`);

    const failure = await scanSource(database, source);
    return { library: readLibrary(database), scanFailures: failure ? [failure] : [] };
  });

  ipcMain.handle(lumeChannels.rescanSources, async (event) => {
    requireTrustedWindow(event);
    const scanFailures = await scanEnabledSources(database);
    return { library: readLibrary(database), scanFailures };
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
  tracksById = new Map(
    tracks.filter((track) => track.available).map((track) => [track.id, track.path]),
  );
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

function handleStartupFailure(error: Error) {
  console.error("Lume could not open its database", error);
  dialog.showErrorBox("Lume could not start", error.message);
  app.quit();
}
