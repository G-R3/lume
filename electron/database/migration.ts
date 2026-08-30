import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { runInTransaction } from "./transaction";

export type Migration = {
  readonly name: string;
  readonly up: (database: DatabaseSync) => void;
  readonly version: number;
};

export type BeforeMigrations = (
  database: DatabaseSync,
  pendingMigrations: readonly Migration[],
) => Promise<void>;

export async function applyMigrations(
  database: DatabaseSync,
  migrations: readonly Migration[],
  beforeMigrations?: BeforeMigrations,
) {
  validateManifest(migrations);
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const appliedMigrations = new Map(
    database
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => [
        readNumber(row.version, "schema_migrations.version"),
        readString(row.name, "schema_migrations.name"),
      ]),
  );

  appliedMigrations.forEach((name, version) => {
    const migration = migrations.find((candidate) => candidate.version === version);

    if (!migration || migration.name !== name) {
      throw new Error(`Database migration ${version}_${name} is not supported by this build`);
    }
  });

  if ([...appliedMigrations.keys()].some((version, index) => version !== index + 1)) {
    throw new Error("Database migration history must have consecutive versions starting at 1");
  }

  const userVersion = readNumber(
    database.prepare("PRAGMA user_version").get()?.user_version,
    "PRAGMA user_version",
  );

  if (userVersion !== appliedMigrations.size) {
    throw new Error(
      `Database schema version ${userVersion} does not match migration history ${appliedMigrations.size}`,
    );
  }

  const pendingMigrations = migrations.filter(
    (migration) => !appliedMigrations.has(migration.version),
  );

  if (appliedMigrations.size > 0 && pendingMigrations.length > 0 && beforeMigrations) {
    await beforeMigrations(database, pendingMigrations);
  }

  pendingMigrations.forEach((migration) => {
    runInTransaction(database, () => {
      migration.up(database);
      database
        .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, Date.now());
      database.exec(`PRAGMA user_version = ${migration.version}`);
    });
  });
}

function validateManifest(migrations: readonly Migration[]) {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error("Database migrations must have consecutive versions starting at 1");
    }

    if (migration.name.trim().length === 0) {
      throw new Error(`Database migration ${migration.version} must have a name`);
    }
  });
}

function readString(value: SQLOutputValue | undefined, field: string) {
  if (value === undefined || value === null || value instanceof Uint8Array) {
    throw new Error(`Invalid string in ${field}`);
  }

  return String(value);
}

function readNumber(value: SQLOutputValue | undefined, field: string) {
  const number = Number(value);

  if (Number.isSafeInteger(number)) return number;
  throw new Error(`Invalid number in ${field}`);
}
