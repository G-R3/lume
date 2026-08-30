import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const applicationDataDirectory = getApplicationDataDirectory();
const databasePath = join(applicationDataDirectory, "lume", "lume-dev.sqlite");

await Promise.all(
  [databasePath, `${databasePath}-shm`, `${databasePath}-wal`].map((path) =>
    rm(path, { force: true }),
  ),
);

console.log(`Reset development database at ${databasePath}`);

function getApplicationDataDirectory() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");

  if (process.platform === "win32") {
    if (!process.env.APPDATA) throw new Error("APPDATA is not defined");
    return process.env.APPDATA;
  }

  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}
