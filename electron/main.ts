import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import {
  getRendererUrl,
  getTrackUrl,
  handleLumeRequests,
  isTrustedRendererEvent,
  loadRenderer,
  registerLumeScheme,
} from "./renderer";
import { scanAudioFiles } from "./library";
import { lumeChannels } from "../shared/lib";

app.enableSandbox();
registerLumeScheme(protocol);

const rendererDirectory = join(__dirname, "../renderer");
const rendererUrl = getRendererUrl(
  app.isPackaged,
  process.env.ELECTRON_RENDERER_URL,
);
let musicFolder: string | null = null;
let tracksById = new Map<string, string>();

function createWindow() {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
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
  const result = await dialog.showOpenDialog(window, {
    title: "Choose your music folder",
    buttonLabel: "Choose Folder",
    properties: ["openDirectory"],
  });

  if (result.canceled) return null;

  musicFolder = result.filePaths[0] ?? null;
  tracksById.clear();
  return musicFolder;
});

ipcMain.handle(lumeChannels.scanLibrary, async (event) => {
  requireTrustedWindow(event);

  if (!musicFolder) throw new Error("Choose a music folder before scanning");
  const scannedFolder = musicFolder;
  const scannedAudioFiles = await scanAudioFiles(scannedFolder);

  if (scannedFolder !== musicFolder) {
    throw new Error("Music folder changed during scan");
  }

  tracksById = new Map();
  return scannedAudioFiles.map((path) => {
    const id = randomUUID();
    tracksById.set(id, path);

    return {
      id,
      name: basename(path, extname(path)),
      url: getTrackUrl(id),
    };
  });
});

void app.whenReady().then(() => {
  handleLumeRequests(protocol, net, rendererDirectory, () => tracksById);

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
