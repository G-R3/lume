import { join } from "node:path";
import { app, BrowserWindow, dialog, protocol, session, shell } from "electron";
import { appScheme, lumeChannels } from "../shared/lib";
import { loadRenderer, packagedRendererUrl, registerProtocolHandler } from "./protocol";
import { closeDatabase, getLibraryDatabasePath, initializeDatabase } from "./database";
import { registerIpc } from "./ipc";
import { getLibrarySnapshot, scanEnabledSources } from "./library";

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
  app.once("will-quit", closeDatabase);

  registerIpc({ rendererUrl, userDataDirectory });

  registerProtocolHandler(rendererDirectory);

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );

  const window = createWindow();

  void scanEnabledSources()
    .then(() => {
      if (!window.isDestroyed()) {
        window.webContents.send(lumeChannels.libraryUpdated, getLibrarySnapshot());
      }
    })
    .catch((error) => console.error("Could not scan the music library", error));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

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
