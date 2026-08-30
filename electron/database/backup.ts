import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { backup, type DatabaseSync } from "node:sqlite";

const backupKinds = ["manual", "migration", "emergency"] as const;
const migrationBackupLimit = 3;

export type BackupKind = (typeof backupKinds)[number];

export type DatabaseBackup = {
  createdAt: number;
  kind: BackupKind;
  path: string;
};

export async function createBackup(
  database: DatabaseSync,
  backupDirectory: string,
  kind: BackupKind,
) {
  const createdAt = Date.now();
  const directory = join(backupDirectory, kind);
  const path = join(directory, `${createdAt}-${randomUUID()}.sqlite`);
  const temporaryPath = `${path}.tmp`;

  await mkdir(directory, { recursive: true });

  try {
    await backup(database, temporaryPath);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return { createdAt, kind, path } satisfies DatabaseBackup;
}

export async function createMigrationBackup(database: DatabaseSync, backupDirectory: string) {
  await createBackup(database, backupDirectory, "migration");
  await Promise.all(
    (await listBackups(backupDirectory, "migration"))
      .slice(migrationBackupLimit)
      .map((backup) => rm(backup.path)),
  );
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
        return [{ createdAt, kind: backupKind, path: join(directory, entry.name) }];
      });
    }),
  );

  return backups.flat().sort((left, right) => right.createdAt - left.createdAt);
}

export function getLibraryBackupDirectory(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "backups" : "backups-dev");
}
