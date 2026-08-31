import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, type BeforeMigrations } from "./migration";
import { libraryMigrations } from "./migrations";

export type OpenLibraryDatabaseOptions = {
  readonly beforeMigrations?: BeforeMigrations;
};

export async function openLibraryDatabase(
  location: string,
  options: OpenLibraryDatabaseOptions = {},
) {
  if (location !== ":memory:") await mkdir(dirname(location), { recursive: true });

  const database = new DatabaseSync(location);

  try {
    configureLibraryDatabase(database);
    await applyMigrations(database, libraryMigrations, options.beforeMigrations);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function configureLibraryDatabase(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  if (!database.location()) return;

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA wal_checkpoint(PASSIVE);
  `);
}

export function getLibraryDatabasePath(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "lume.sqlite" : "lume-dev.sqlite");
}
