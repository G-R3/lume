import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { backupKinds, backupLimits, type BackupKind, type LibraryBackup } from "../../shared/lib";
import { configureLibraryDatabase, openLibraryDatabase, validateCurrentLibraryDatabase } from ".";
import { getAppliedMigrations } from "./migration";
import { libraryMigrations } from "./migrations";

export type DatabaseBackup = LibraryBackup & {
  path: string;
};

export function createBackupManager(database: DatabaseSync, backupDirectory: string) {
  let pendingOperation = Promise.resolve();

  function run<T>(operation: () => Promise<T>) {
    const result = pendingOperation.then(operation, operation);
    pendingOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    createManual: () =>
      run(async () => {
        const backups = await listBackups(backupDirectory);

        if (backups.filter((backup) => backup.kind === "manual").length >= backupLimits.manual) {
          throw new Error("Manual backup limit reached");
        }

        return [await createBackup(database, backupDirectory, "manual"), ...backups];
      }),
    replaceOldestManual: () => run(() => replaceOldestManualBackup(database, backupDirectory)),
    restore: (backupId: string) =>
      run(() => restoreLibraryDatabase(database, backupDirectory, backupId)),
  };
}

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
  await mkdir(backupDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(backupDirectory, "restore-"));
  const candidatePath = join(temporaryDirectory, "candidate.sqlite");
  let backupDatabase: DatabaseSync | undefined;
  let candidateDatabase: DatabaseSync | undefined;

  try {
    backupDatabase = new DatabaseSync(selectedBackup.path, { readOnly: true });
    await backup(backupDatabase, candidatePath);
    validateBackup(candidatePath);
    candidateDatabase = await openLibraryDatabase(candidatePath);

    await createBackup(database, backupDirectory, "emergency");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close();
    await backup(candidateDatabase, databasePath);
    database.open();
    configureLibraryDatabase(database);
    validateCurrentLibraryDatabase(database);
  } catch (error) {
    if (!database.isOpen) {
      database.open();
      configureLibraryDatabase(database);
    }

    throw error;
  } finally {
    if (candidateDatabase?.isOpen) candidateDatabase.close();
    if (backupDatabase?.isOpen) backupDatabase.close();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

export function getLibraryBackupDirectory(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "backups" : "backups-dev");
}
