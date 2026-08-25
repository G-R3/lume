import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
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
import { scanAudioFiles } from "./library";
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

  const folder = result.filePaths[0];
  if (!folder) return null;

  const nextTracksById = new Map<string, string>();
  const tracks = (await scanAudioFiles(folder)).map((path) => {
    const id = randomUUID();
    nextTracksById.set(id, path);

    return {
      id,
      name: basename(path, extname(path)),
      url: getTrackUrl(id),
    };
  });

  tracksById = nextTracksById;
  return { folder, tracks };
});

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
