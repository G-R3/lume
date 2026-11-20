import { join } from "node:path";

export function getLibraryDatabasePath(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "lume.sqlite" : "lume-dev.sqlite");
}
