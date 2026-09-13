import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getLibraryDatabasePath, openLibraryDatabase } from ".";
import { applyMigrations, type Migration } from "./migration";
import { initialLibraryMigration } from "./migrations/001-initial-library";
import { getSources } from "../library-store";
import { scanSource } from "../library-scan";
import { createPlaylist, getPlaylists } from "../playlist-store";
import { getTracks } from "../track-store";

const temporaryFolders: string[] = [];

const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library database lifecycle", () => {
  it("persists data after closing and reopening a file-backed database", async () => {
    const folder = await createTemporaryFolder("lume-database-");
    const databasePath = join(folder, "nested", "library.sqlite");
    const database = await openLibraryDatabase(databasePath);
    database
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run("source-1", "/Music", 1, 1);
    database.close();

    const reopenedDatabase = await openLibraryDatabase(databasePath);
    openDatabases.push(reopenedDatabase);
    expect(reopenedDatabase.prepare("SELECT id, path FROM library_sources").get()).toEqual({
      id: "source-1",
      path: "/Music",
    });
  });

  it("uses separate development and packaged database names", () => {
    expect(getLibraryDatabasePath("/data", false)).toBe(join("/data", "lume-dev.sqlite"));
    expect(getLibraryDatabasePath("/data", true)).toBe(join("/data", "lume.sqlite"));
  });
});

describe("library database migrations", () => {
  it("upgrades a version 1 library without losing data", async () => {
    const folder = await createTemporaryFolder("lume-database-");
    const databasePath = join(folder, "library.sqlite");
    const versionOneDatabase = new DatabaseSync(databasePath);
    applyMigrations(versionOneDatabase, [initialLibraryMigration]);
    versionOneDatabase
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run("source-1", "/Music", 1, 1);
    versionOneDatabase
      .prepare(
        `INSERT INTO tracks (
          id, source_id, path, name, duration, format, file_size, modified_at,
          available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run("track-1", "source-1", "/Music/song.mp3", "song", null, "MP3", 1, 1, 1, 1);
    versionOneDatabase.close();

    const database = await openLibraryDatabase(databasePath);
    openDatabases.push(database);
    createPlaylist(database, { description: "Long drives", title: "Road Trip" });

    expect(getSources(database)).toEqual([
      {
        enabled: true,
        id: "source-1",
        lastScanError: null,
        lastScannedAt: null,
        path: "/Music",
        trackCount: 1,
      },
    ]);
    expect(getPlaylists(database)).toMatchObject([
      { description: "Long drives", entryCount: 0, title: "Road Trip" },
    ]);
    expect(getTracks(database).map((track) => ({ id: track.id, title: track.title }))).toEqual([
      { id: "track-1", title: "song" },
    ]);
  });

  it("refreshes metadata from an older library when the audio file has not changed", async () => {
    const folder = await createTemporaryFolder("lume-database-");
    const sourceFolder = await createTemporaryFolder("lume-source-");
    const trackPath = join(sourceFolder, "song.mp3");
    await writeFile(trackPath, "");
    const file = await stat(trackPath);
    const databasePath = join(folder, "library.sqlite");
    const versionOneDatabase = new DatabaseSync(databasePath);
    applyMigrations(versionOneDatabase, [initialLibraryMigration]);
    versionOneDatabase
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run("source-1", sourceFolder, 1, 1);
    versionOneDatabase
      .prepare(
        `INSERT INTO tracks (
          id, source_id, path, name, duration, format, file_size, modified_at,
          available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        "track-1",
        "source-1",
        trackPath,
        "stale title",
        null,
        "MP3",
        file.size,
        Math.trunc(file.mtimeMs),
        1,
        1,
      );
    versionOneDatabase.close();

    const database = await openLibraryDatabase(databasePath);
    openDatabases.push(database);
    await scanSource(database, "source-1");

    expect(getTracks(database).map((track) => ({ id: track.id, title: track.title }))).toEqual([
      { id: "track-1", title: "song" },
    ]);
  });

  it("rolls back a failed migration and its journal entry together", () => {
    const database = new DatabaseSync(":memory:");
    openDatabases.push(database);

    const failingMigration = {
      name: "failing-migration",
      version: 2,
      up(database) {
        database.exec("CREATE TABLE should_not_survive (id TEXT PRIMARY KEY) STRICT");
        throw new Error("Migration failed on purpose");
      },
    } satisfies Migration;

    expect(() => applyMigrations(database, [documentsMigration, failingMigration])).toThrow(
      "Migration failed on purpose",
    );
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'documents'").get(),
    ).toEqual({ name: "documents" });
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'should_not_survive'").get(),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
    ).toEqual([{ version: 1 }]);
  });

  it("rejects migration history that the manifest does not recognize", () => {
    const database = new DatabaseSync(":memory:");
    openDatabases.push(database);
    applyMigrations(database, [documentsMigration]);
    database
      .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'future', 1)")
      .run();

    expect(() => applyMigrations(database, [documentsMigration])).toThrow(
      "Database migration 2_future is not supported by this build",
    );
  });

  it("rejects migration history with a missing version", () => {
    const database = new DatabaseSync(":memory:");
    openDatabases.push(database);
    applyMigrations(database, [documentsMigration]);
    database
      .prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'third-migration', 1)",
      )
      .run();

    expect(() =>
      applyMigrations(database, [documentsMigration, secondMigration, thirdMigration]),
    ).toThrow("history must have consecutive versions");
  });
});

const documentsMigration = {
  name: "documents",
  version: 1,
  up(database) {
    database.exec("CREATE TABLE documents (id TEXT PRIMARY KEY) STRICT");
  },
} satisfies Migration;

const secondMigration = {
  name: "second-migration",
  version: 2,
  up() {},
} satisfies Migration;

const thirdMigration = {
  name: "third-migration",
  version: 3,
  up() {},
} satisfies Migration;

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}
