import { mkdtemp, rm } from "node:fs/promises";
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
});

async function openTestDatabase(location = ":memory:") {
  const database = (await openLibraryDatabase(location, join(import.meta.dirname, "../../drizzle")))
    .$client;

  openDatabases.push(database);

  return database;
}

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}
