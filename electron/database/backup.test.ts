import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createBackup,
  createBackupManager,
  createMigrationBackup,
  getBackup,
  getLibraryBackupDirectory,
  listBackups,
  replaceOldestManualBackup,
  restoreLibraryDatabase,
  validateBackup,
} from "./backup";
import { openLibraryDatabase } from ".";

const temporaryFolders: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases
    .splice(0)
    .filter((database) => database.isOpen)
    .forEach((database) => database.close());
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

  it("replaces the oldest manual backup", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    await mkdir(join(folder, "manual"));
    await Promise.all(
      [1, 2, 3, 4, 5].map((createdAt) =>
        writeFile(join(folder, "manual", `${createdAt}-backup.sqlite`), ""),
      ),
    );

    const backups = await replaceOldestManualBackup(database, folder);

    expect(backups).toHaveLength(5);
    expect(backups.some((backup) => backup.createdAt === 1)).toBe(false);
    expect(await listBackups(folder, "manual")).toEqual(backups);
  });

  it("does not replace a manual backup before reaching the limit", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);

    await expect(replaceOldestManualBackup(database, folder)).rejects.toThrow(
      "Manual backup limit has not been reached",
    );
    expect(await listBackups(folder)).toEqual([]);
  });

  it("enforces the manual backup limit across concurrent requests", async () => {
    const folder = await createTemporaryFolder();
    const database = await openLibraryDatabase(":memory:");
    openDatabases.push(database);
    await mkdir(join(folder, "manual"));
    await Promise.all(
      [1, 2, 3, 4].map((createdAt) =>
        writeFile(join(folder, "manual", `${createdAt}-backup.sqlite`), ""),
      ),
    );
    const backupManager = createBackupManager(database, folder);

    const firstBackup = backupManager.createManual();
    const secondBackup = backupManager.createManual();

    await expect(firstBackup).resolves.toHaveLength(5);
    await expect(secondBackup).rejects.toThrow("Manual backup limit reached");
    expect(await listBackups(folder, "manual")).toHaveLength(5);
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

  it("rejects a backup with missing application schema before changing the live database", async () => {
    const folder = await createTemporaryFolder();
    const backupDirectory = join(folder, "backups");
    const invalidDatabase = await openLibraryDatabase(join(folder, "invalid.sqlite"));
    openDatabases.push(invalidDatabase);
    invalidDatabase.exec("DROP TABLE track_state; DROP TABLE tracks");
    const selectedBackup = await createBackup(invalidDatabase, backupDirectory, "manual");
    const database = await openLibraryDatabase(join(folder, "library.sqlite"));
    openDatabases.push(database);
    database
      .prepare(
        "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, 1, 1)",
      )
      .run("current-source", "/Current");

    await expect(
      restoreLibraryDatabase(database, backupDirectory, selectedBackup.id),
    ).rejects.toThrow();

    expect(database.prepare("SELECT id FROM library_sources").all()).toEqual([
      { id: "current-source" },
    ]);
    expect(await listBackups(backupDirectory, "emergency")).toEqual([]);
  });

  it("rejects a backup with foreign key failures before changing the live database", async () => {
    const folder = await createTemporaryFolder();
    const backupDirectory = join(folder, "backups");
    const invalidDatabase = await openLibraryDatabase(join(folder, "invalid.sqlite"));
    openDatabases.push(invalidDatabase);
    invalidDatabase.exec("PRAGMA foreign_keys = OFF");
    invalidDatabase
      .prepare(
        `INSERT INTO tracks (
          id, source_id, path, name, duration, format, file_size, modified_at,
          available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, 1, 1, 1, 1, 1)`,
      )
      .run("orphan-track", "missing-source", "/orphan.mp3", "orphan", "MP3");
    const selectedBackup = await createBackup(invalidDatabase, backupDirectory, "manual");
    const database = await openLibraryDatabase(join(folder, "library.sqlite"));
    openDatabases.push(database);

    await expect(
      restoreLibraryDatabase(database, backupDirectory, selectedBackup.id),
    ).rejects.toThrow("foreign key check");

    expect(database.prepare("SELECT id FROM tracks").all()).toEqual([]);
    expect(await listBackups(backupDirectory, "emergency")).toEqual([]);
  });

  it("restores a backup after preserving the current database", async () => {
    const folder = await createTemporaryFolder();
    const databasePath = join(folder, "library.sqlite");
    const backupDirectory = join(folder, "backups");
    const database = await openLibraryDatabase(databasePath);
    openDatabases.push(database);
    const saveSource = database.prepare(
      "INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (?, ?, 1, 1, 1)",
    );
    saveSource.run("source-1", "/First");
    const selectedBackup = await createBackup(database, backupDirectory, "manual");
    database.prepare("DELETE FROM library_sources").run();
    saveSource.run("source-2", "/Second");

    await restoreLibraryDatabase(database, backupDirectory, selectedBackup.id);

    expect(database.isOpen).toBe(true);
    expect(database.prepare("SELECT id, path FROM library_sources").all()).toEqual([
      { id: "source-1", path: "/First" },
    ]);

    const emergencyBackup = (await listBackups(backupDirectory, "emergency"))[0];
    expect(emergencyBackup).toBeDefined();
    const emergencyDatabase = new DatabaseSync(emergencyBackup.path, { readOnly: true });
    openDatabases.push(emergencyDatabase);
    expect(emergencyDatabase.prepare("SELECT id, path FROM library_sources").all()).toEqual([
      { id: "source-2", path: "/Second" },
    ]);
  });

  it("leaves the current database open when restore validation fails", async () => {
    const folder = await createTemporaryFolder();
    const backupDirectory = join(folder, "backups");
    await mkdir(join(backupDirectory, "manual"), { recursive: true });
    await writeFile(join(backupDirectory, "manual", "1-corrupt.sqlite"), "not a database");
    const database = await openLibraryDatabase(join(folder, "library.sqlite"));
    openDatabases.push(database);

    await expect(
      restoreLibraryDatabase(database, backupDirectory, "1-corrupt.sqlite"),
    ).rejects.toThrow();

    expect(database.isOpen).toBe(true);
    expect(await listBackups(backupDirectory, "emergency")).toEqual([]);
  });

  it("reopens the current database when the restore write fails", async () => {
    const folder = await createTemporaryFolder();
    const databasePath = join(folder, "library.sqlite");
    const backupDirectory = join(folder, "backups");
    const database = await openLibraryDatabase(databasePath);
    openDatabases.push(database);
    database.exec("PRAGMA busy_timeout = 1");
    const selectedBackup = await createBackup(database, backupDirectory, "manual");
    const blockingDatabase = new DatabaseSync(databasePath);
    openDatabases.push(blockingDatabase);
    blockingDatabase.exec("PRAGMA journal_mode = WAL; BEGIN IMMEDIATE");

    await expect(
      restoreLibraryDatabase(database, backupDirectory, selectedBackup.id),
    ).rejects.toThrow();

    expect(database.isOpen).toBe(true);
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    blockingDatabase.exec("ROLLBACK");
  });
});

async function createTemporaryFolder() {
  const folder = await mkdtemp(join(tmpdir(), "lume-backup-"));
  temporaryFolders.push(folder);
  return folder;
}
