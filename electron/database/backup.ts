import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { backupKinds, backupLimits, type BackupKind, type LibraryBackup } from "../../shared/lib";
import { configureLibraryDatabase } from ".";
import { applyMigrations, getAppliedMigrations } from "./migration";
import { libraryMigrations } from "./migrations";

export type DatabaseBackup = LibraryBackup & {
  path: string;
};

export async function createBackup(
  database: DatabaseSync,
  backupDirectory: string,
  kind: BackupKind,
) {
  const createdAt = Date.now();
  const directory = join(backupDirectory, kind);
  const id = `${createdAt}-${randomUUID()}.sqlite`;
  const path = join(directory, id);
  const temporaryPath = `${path}.tmp`;

  await mkdir(directory, { recursive: true });

  try {
    await backup(database, temporaryPath);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return { createdAt, id, kind, path } satisfies DatabaseBackup;
}

export async function createMigrationBackup(database: DatabaseSync, backupDirectory: string) {
  await createBackup(database, backupDirectory, "migration");
  await Promise.all(
    (await listBackups(backupDirectory, "migration"))
      .slice(backupLimits.migration)
      .map((backup) => rm(backup.path)),
  );
}

export async function replaceOldestManualBackup(database: DatabaseSync, backupDirectory: string) {
  const backups = await listBackups(backupDirectory);
  const manualBackups = backups.filter((backup) => backup.kind === "manual");

  if (manualBackups.length < backupLimits.manual) {
    throw new Error("Manual backup limit has not been reached");
  }

  const backupsToRemove = manualBackups.slice(backupLimits.manual - 1);
  const createdBackup = await createBackup(database, backupDirectory, "manual");
  await Promise.all(backupsToRemove.map((backup) => rm(backup.path)));

  return [createdBackup, ...backups.filter((backup) => !backupsToRemove.includes(backup))];
}

export async function listBackups(backupDirectory: string, kind?: BackupKind) {
  const backups = await Promise.all(
    (kind ? [kind] : backupKinds).map(async (backupKind) => {
      const directory = join(backupDirectory, backupKind);
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );

      return entries.flatMap((entry) => {
        const createdAt = Number(/^(\d+)-.+\.sqlite$/.exec(entry.name)?.[1]);

        if (!entry.isFile() || !Number.isSafeInteger(createdAt)) return [];
        return [{ createdAt, id: entry.name, kind: backupKind, path: join(directory, entry.name) }];
      });
    }),
  );

  return backups.flat().sort((left, right) => right.createdAt - left.createdAt);
}

export async function getBackup(backupDirectory: string, id: string) {
  const backup = (await listBackups(backupDirectory)).find((backup) => backup.id === id);

  if (backup) return backup;
  throw new Error(`Backup ${id} does not exist`);
}

export function validateBackup(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });

  try {
    const integrityCheck = database.prepare("PRAGMA integrity_check").all();

    if (integrityCheck.length !== 1 || integrityCheck[0]?.integrity_check !== "ok") {
      throw new Error("Backup failed its SQLite integrity check");
    }

    getAppliedMigrations(database, libraryMigrations);
  } finally {
    database.close();
  }
}

export async function restoreLibraryDatabase(
  database: DatabaseSync,
  backupDirectory: string,
  backupId: string,
) {
  const databasePath = database.location();

  if (!databasePath) throw new Error("An in-memory database cannot be restored");

  const selectedBackup = await getBackup(backupDirectory, backupId);
  validateBackup(selectedBackup.path);
  const backupDatabase = new DatabaseSync(selectedBackup.path, { readOnly: true });

  try {
    await createBackup(database, backupDirectory, "emergency");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close();
    await backup(backupDatabase, databasePath);
    database.open();
    configureLibraryDatabase(database);
    await applyMigrations(database, libraryMigrations, (database) =>
      createMigrationBackup(database, backupDirectory),
    );
  } catch (error) {
    if (!database.isOpen) {
      database.open();
      configureLibraryDatabase(database);
    }

    throw error;
  } finally {
    backupDatabase.close();
  }
}

export function getLibraryBackupDirectory(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "backups" : "backups-dev");
}
