import { cp } from "node:fs/promises";
import { createTemporaryFolder } from "../../tests/helpers/temp-folder";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getLibraryDatabasePath, openLibraryDatabase } from ".";

const openDatabases: DatabaseSync[] = [];

afterEach(() => {
  openDatabases.splice(0).forEach((database) => {
    if (database.isOpen) database.close();
  });
});

describe("library database lifecycle", () => {
  it("uses separate development and packaged database names", () => {
    expect(getLibraryDatabasePath("/data", false)).toBe(join("/data", "lume-dev.sqlite"));
    expect(getLibraryDatabasePath("/data", true)).toBe(join("/data", "lume.sqlite"));
  });

  it("rejects an enabled source after it has been forgotten", async () => {
    const database = await openTestDatabase();
    database
      .prepare(
        "INSERT INTO library_sources (path, enabled, forgotten_at, created_at, updated_at) VALUES (?, 0, ?, ?, ?)",
      )
      .run("/Music", 1, 1, 1);

    expect(() =>
      database.prepare("UPDATE library_sources SET enabled = 1 WHERE path = ?").run("/Music"),
    ).toThrow(/library_sources_forgotten_check/);
  });

  it("adds the forgotten-source constraint without losing existing tracks", async () => {
    const folder = await createTemporaryFolder("lume-database-migration-");
    const previousMigrations = join(folder, "previous-migrations");
    await cp(
      join(import.meta.dirname, "../../drizzle/20260920195450_baseline"),
      join(previousMigrations, "20260920195450_baseline"),
      { recursive: true },
    );
    const databasePath = join(folder, "library.sqlite");
    const previousDatabase = await openTestDatabase(databasePath, previousMigrations);
    previousDatabase
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (1, '/Music', 1, 1, 1)",
      )
      .run();
    previousDatabase
      .prepare(
        `INSERT INTO tracks (
          id, source_id, path, title, format, file_size, modified_at, available, created_at,
          updated_at, artists, album_artists, genres, metadata_version
        ) VALUES (1, 1, '/Music/song.wav', 'Song', 'WAV', 1, 1, 1, 1, 1, '[]', '[]', '[]', 1)`,
      )
      .run();
    previousDatabase.close();

    const migratedDatabase = await openTestDatabase(databasePath);

    expect(migratedDatabase.prepare("SELECT id, source_id FROM tracks").get()).toEqual({
      id: 1,
      source_id: 1,
    });
    expect(migratedDatabase.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

async function openTestDatabase(
  location = ":memory:",
  migrationsFolder = join(import.meta.dirname, "../../drizzle"),
) {
  const database = (await openLibraryDatabase(location, migrationsFolder)).$client;

  openDatabases.push(database);

  return database;
}
