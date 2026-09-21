import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getLibraryDatabasePath, openLibraryDatabase } from ".";

const temporaryFolders: string[] = [];

const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => {
    if (database.isOpen) database.close();
  });
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library database lifecycle", () => {
  it("persists data after closing and reopening a file-backed database", async () => {
    const folder = await createTemporaryFolder("lume-database-");
    const databasePath = join(folder, "nested", "library.sqlite");
    const database = await openTestDatabase(databasePath);
    database
      .prepare(
        "INSERT INTO library_sources (path, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)",
      )
      .run("/Music", 1, 1);
    database.close();

    const reopenedDatabase = await openTestDatabase(databasePath);
    expect(reopenedDatabase.prepare("SELECT id, path FROM library_sources").get()).toEqual({
      id: 1,
      path: "/Music",
    });
  });

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

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}
