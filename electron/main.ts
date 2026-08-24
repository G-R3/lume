import { join } from "node:path";
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
  handleRendererRequests,
  isTrustedRendererEvent,
  loadRenderer,
  registerRendererScheme,
} from "./renderer";
import { lumeChannels } from "../shared/lib";

app.enableSandbox();
registerRendererScheme(protocol);

const rendererDirectory = join(__dirname, "../renderer");
const rendererUrl = getRendererUrl(
  app.isPackaged,
  process.env.ELECTRON_RENDERER_URL,
);

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

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

void app.whenReady().then(() => {
  handleRendererRequests(protocol, net, rendererDirectory);

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
