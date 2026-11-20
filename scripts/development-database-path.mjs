import { homedir } from "node:os";
import { join } from "node:path";
import { getLibraryDatabasePath } from "../electron/database/location.ts";
import packageJson from "../package.json" with { type: "json" };

export function getDevelopmentDatabasePath() {
  return getLibraryDatabasePath(getUserDataDirectory(), false);
}

// Electron names the userData folder after package.json productName, falling back to name.
function getUserDataDirectory() {
  return join(getApplicationDataDirectory(), packageJson.productName ?? packageJson.name);
}

function getApplicationDataDirectory() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");

  if (process.platform === "win32") {
    if (!process.env.APPDATA) throw new Error("APPDATA is not defined");

    return process.env.APPDATA;
  }

  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}
