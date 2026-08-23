import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron/main";

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

  ipcMain.handle("ping", () => "pong");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
