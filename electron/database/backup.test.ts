import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createBackup,
  createManualBackup,
  createMigrationBackup,
  getBackup,
  getLibraryBackupDirectory,
  listBackups,
  validateBackup,
} from "./backup";
import { openLibraryDatabase } from ".";

const temporaryFolders: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("database backups", () => {
  it("creates a consistent snapshot of a live WAL database", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(join(folder, "library.sqlite"));
    openDatabases.push(database);
    database
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run("source-1", "/Music", 1, 1);

    const backupDirectory = join(folder, "backups");
    const createdBackup = await createBackup(database, backupDirectory, "manual");
    database.prepare("DELETE FROM library_sources WHERE id = ?").run("source-1");

    const restoredDatabase = new DatabaseSync(createdBackup.path, { readOnly: true });
    openDatabases.push(restoredDatabase);
    expect(restoredDatabase.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(restoredDatabase.prepare("SELECT id, path FROM library_sources").get()).toEqual({
      id: "source-1",
      path: "/Music",
    });
    expect(() => validateBackup(createdBackup.path)).not.toThrow();
    await expect(getBackup(backupDirectory, createdBackup.id)).resolves.toEqual(createdBackup);
  });

  it("keeps the three newest migration backups", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);

    await createMigrationBackup(database, folder);
    await createMigrationBackup(database, folder);
    await createMigrationBackup(database, folder);
    await createMigrationBackup(database, folder);

    expect(await listBackups(folder, "migration")).toHaveLength(3);
  });

  it("requires confirmation before replacing the oldest manual backup", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    await mkdir(join(folder, "manual"));
    await Promise.all(
      [1, 2, 3, 4, 5].map((createdAt) =>
        writeFile(join(folder, "manual", `${createdAt}-backup.sqlite`), ""),
      ),
    );

    const result = await createManualBackup(database, folder);

    expect(result).toEqual({
      oldestBackup: {
        createdAt: 1,
        id: "1-backup.sqlite",
        kind: "manual",
        path: join(folder, "manual", "1-backup.sqlite"),
      },
      status: "confirmation-required",
    });
    expect(await listBackups(folder, "manual")).toHaveLength(5);
  });

  it("replaces the oldest manual backup after confirmation", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    await mkdir(join(folder, "manual"));
    await Promise.all(
      [1, 2, 3, 4, 5].map((createdAt) =>
        writeFile(join(folder, "manual", `${createdAt}-backup.sqlite`), ""),
      ),
    );

    const result = await createManualBackup(database, folder, true);
    const backups = await listBackups(folder, "manual");

    expect(result.status).toBe("created");
    expect(backups).toHaveLength(5);
    expect(backups.some((backup) => backup.createdAt === 1)).toBe(false);
  });

  it("uses separate development and packaged backup directories", () => {
    expect(getLibraryBackupDirectory("/data", false)).toBe(join("/data", "backups-dev"));
    expect(getLibraryBackupDirectory("/data", true)).toBe(join("/data", "backups"));
  });

  it("rejects corrupt and unknown backups", async () => {
    const folder = await createTemporaryFolder();
    const backupDirectory = join(folder, "backups");
    await mkdir(join(backupDirectory, "manual"), { recursive: true });
    const corruptBackupPath = join(backupDirectory, "manual", "1-corrupt.sqlite");
    await writeFile(corruptBackupPath, "not a database");

    expect(() => validateBackup(corruptBackupPath)).toThrow();
    await expect(getBackup(backupDirectory, "missing.sqlite")).rejects.toThrow(
      "Backup missing.sqlite does not exist",
    );
  });

  it("rejects backups created by an unsupported database version", async () => {
    const folder = await createTemporaryFolder();
    const path = join(folder, "future.sqlite");
    const database = await openLibraryDatabase(path);
    database
      .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'future', 1)")
      .run();
    database.exec("PRAGMA user_version = 2");
    database.close();

    expect(() => validateBackup(path)).toThrow(
      "Database migration 2_future is not supported by this build",
    );
  });
});

async function createTemporaryFolder() {
  const folder = await mkdtemp(join(tmpdir(), "lume-backup-"));
  temporaryFolders.push(folder);
  return folder;
}
