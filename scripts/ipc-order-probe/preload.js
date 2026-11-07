const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Set();

ipcRenderer.on("push", (_event, value) => listeners.forEach((listener) => listener(value)));

contextBridge.exposeInMainWorld("lume", {
  done: (result) => ipcRenderer.send("done", result),
  onPush: (listener) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  },
  read: () => ipcRenderer.invoke("read"),
  ready: () => ipcRenderer.send("ready"),
  slow: () => ipcRenderer.invoke("slow"),
});
