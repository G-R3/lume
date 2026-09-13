import { homedir } from "node:os";
import { join } from "node:path";

export function getDevelopmentDatabasePath() {
  return join(getApplicationDataDirectory(), "lume", "lume-dev.sqlite");
}

function getApplicationDataDirectory() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");

  if (process.platform === "win32") {
    if (!process.env.APPDATA) throw new Error("APPDATA is not defined");

    return process.env.APPDATA;
  }

  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}
