import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { lumeChannels } from "../shared/lib";

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

  window.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"));
}

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.handle(lumeChannels.ping, () => "pong");
  ipcMain.handle(lumeChannels.selectFolder, async (event) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender);

    if (!mainWindow) throw new Error("Requesting window was not found");

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a folder",
      properties: ["openDirectory"],
    });

    return result.canceled ? null : result.filePaths[0];
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
