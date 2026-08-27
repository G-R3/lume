import { randomUUID } from "node:crypto";
import { join } from "node:path";
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
import {
  readMusicFolder,
  saveMusicFolder,
  scanAudioFiles,
} from "./library";
import { lumeChannels } from "../shared/lib";

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
    width: 2020,
    height: 1280,
    backgroundColor: "#000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
    },
  });

  loadRenderer(window, rendererUrl);
}

ipcMain.handle(lumeChannels.chooseMusicFolder, async (event) => {
  const window = requireTrustedWindow(event);
  const savedFolder = await readMusicFolder(app.getPath("userData"));
  const result = await dialog.showOpenDialog(window, {
    title: "Choose your music folder",
    buttonLabel: "Choose Folder",
    defaultPath: savedFolder ?? undefined,
    properties: ["openDirectory"],
  });

  if (result.canceled) return null;

  const folder = result.filePaths[0];
  if (!folder) return null;

  const nextLibrary = await scanMusicLibrary(folder);
  await saveMusicFolder(app.getPath("userData"), folder);
  tracksById = nextLibrary.tracksById;
  return nextLibrary.library;
});

ipcMain.handle(lumeChannels.loadMusicLibrary, async (event) => {
  requireTrustedWindow(event);
  const folder = await readMusicFolder(app.getPath("userData"));

  if (!folder) return null;

  const nextLibrary = await scanMusicLibrary(folder);
  tracksById = nextLibrary.tracksById;
  return nextLibrary.library;
});

async function scanMusicLibrary(folder: string) {
  const nextTracksById = new Map<string, string>();
  const tracks = (await scanAudioFiles(folder)).map((track) => {
    const id = randomUUID();
    nextTracksById.set(id, track.path);

    return {
      duration: track.duration,
      format: track.format,
      id,
      name: track.name,
      url: getTrackUrl(id),
    };
  });

  return {
    library: { folder, tracks },
    tracksById: nextTracksById,
  };
}

void app.whenReady().then(() => {
  registerProtocolHandler(rendererDirectory, () => tracksById);

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function requireTrustedWindow(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (
    !window ||
    window.isDestroyed() ||
    !isTrustedRendererEvent(event, rendererUrl)
  ) {
    throw new Error("Blocked IPC request from an untrusted renderer");
  }

  return window;
}
