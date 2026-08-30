import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getLibraryDatabasePath, openLibraryDatabase } from ".";
import { applyMigrations, type Migration } from "./migration";
import { currentSchemaVersion, libraryMigrations } from "./migrations";

const temporaryFolders: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library database lifecycle", () => {
  it("creates the current schema and configures SQLite", async () => {
    const callbackCalls: number[] = [];
    const database = await openLibraryDatabase(":memory:", {
      beforeMigrations: async () => {
        callbackCalls.push(1);
      },
    });
    openDatabases.push(database);

    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(database.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5_000 });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "library_sources" },
      { name: "schema_migrations" },
      { name: "track_state" },
      { name: "tracks" },
    ]);
    expect(database.prepare("SELECT version, name FROM schema_migrations").all()).toEqual([
      { name: "initial-library", version: 1 },
    ]);
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(callbackCalls).toEqual([]);
  });

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
  it("keeps the declared schema version aligned with the migration manifest", () => {
    expect(libraryMigrations.map((migration) => migration.version)).toEqual([1]);
    expect(currentSchemaVersion).toBe(1);
  });

  it("upgrades an existing schema and calls the backup boundary first", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    const observations: string[] = [];

    await applyMigrations(
      database,
      [...libraryMigrations, addSourceColorMigration],
      async (database, pendingMigrations) => {
        observations.push("before");
        expect(pendingMigrations.map((migration) => migration.version)).toEqual([2]);
        expect(
          database
            .prepare("SELECT name FROM pragma_table_info('library_sources') WHERE name = 'color'")
            .get(),
        ).toBeUndefined();
      },
    );

    expect(observations).toEqual(["before"]);
    expect(
      database
        .prepare("SELECT name FROM pragma_table_info('library_sources') WHERE name = 'color'")
        .get(),
    ).toEqual({ name: "color" });
    expect(
      database.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all(),
    ).toEqual([
      { name: "initial-library", version: 1 },
      { name: "add-source-color", version: 2 },
    ]);
  });

  it("rolls back a failed migration and its journal entry together", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    const failingMigration = {
      name: "failing-migration",
      version: 2,
      up(database) {
        database.exec("CREATE TABLE should_not_survive (id TEXT PRIMARY KEY) STRICT");
        throw new Error("Migration failed on purpose");
      },
    } satisfies Migration;

    await expect(
      applyMigrations(database, [...libraryMigrations, failingMigration]),
    ).rejects.toThrow("Migration failed on purpose");
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'should_not_survive'").get(),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
    ).toEqual([{ version: 1 }]);
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
  });

  it("rejects migration history that this build does not recognize", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    database
      .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'future', 1)")
      .run();

    await expect(applyMigrations(database, libraryMigrations)).rejects.toThrow(
      "Database migration 2_future is not supported by this build",
    );
  });

  it("rejects migration history with a missing version", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    database
      .prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'third-migration', 1)",
      )
      .run();

    await expect(
      applyMigrations(database, [...libraryMigrations, addSourceColorMigration, thirdMigration]),
    ).rejects.toThrow("history must have consecutive versions");
  });

  it("rejects a schema version that disagrees with migration history", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    database.exec("PRAGMA user_version = 0");

    await expect(applyMigrations(database, libraryMigrations)).rejects.toThrow(
      "schema version 0 does not match migration history 1",
    );
  });

  it("rejects migration manifests with gaps", async () => {
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);

    await expect(
      applyMigrations(database, [libraryMigrations[0], { ...addSourceColorMigration, version: 3 }]),
    ).rejects.toThrow("consecutive versions");
  });
});

const addSourceColorMigration = {
  name: "add-source-color",
  version: 2,
  up(database) {
    database.exec("ALTER TABLE library_sources ADD COLUMN color TEXT");
  },
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
