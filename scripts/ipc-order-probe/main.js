const { app, BrowserWindow, ipcMain } = require("electron");

const path = require("node:path");

const rounds = Number(process.env.ROUNDS || 8000);

let stamp = 0;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  let pushes;

  ipcMain.handle("read", () => {
    const readStamp = ++stamp;

    if (readStamp % 4 === 2) setImmediate(() => window.webContents.send("push", ++stamp));

    return readStamp;
  });

  ipcMain.handle("slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));

    return ++stamp;
  });

  ipcMain.on("ready", () => {
    pushes = setInterval(() => {
      if (!window.isDestroyed()) window.webContents.send("push", ++stamp);
    }, 0);
  });

  ipcMain.on("done", (_event, result) => {
    clearInterval(pushes);
    console.log(JSON.stringify(result));
    app.exit(result.repliesOutOfOrder === 0 ? 0 : 1);
  });

  await window.loadFile(path.join(__dirname, "index.html"), { query: { rounds: String(rounds) } });
});
