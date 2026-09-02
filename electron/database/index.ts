import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, getAppliedMigrations } from "./migration";
import { libraryMigrations } from "./migrations";

export async function openLibraryDatabase(location: string) {
  if (location !== ":memory:") await mkdir(dirname(location), { recursive: true });

  const database = new DatabaseSync(location);
  try {
    configureLibraryDatabase(database);
    applyMigrations(database, libraryMigrations);
    validateCurrentLibraryDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function validateCurrentLibraryDatabase(database: DatabaseSync) {
  if (getAppliedMigrations(database, libraryMigrations).size !== libraryMigrations.length) {
    throw new Error("Database is not at the current schema version");
  }

  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length > 0) throw new Error("Database failed its foreign key check");

  [
    `SELECT id, path, enabled, forgotten_at, last_scanned_at, last_scan_error,
      created_at, updated_at FROM library_sources LIMIT 0`,
    `SELECT id, source_id, path, name, duration, format, file_size, modified_at,
      available, created_at, updated_at FROM tracks LIMIT 0`,
    "SELECT track_id, starred_at FROM track_state LIMIT 0",
    "SELECT id, title, description, created_at, updated_at FROM playlists LIMIT 0",
    `SELECT id, playlist_id, track_id, position, created_at
      FROM playlist_entries LIMIT 0`,
  ].forEach((query) => database.prepare(query).all());
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
