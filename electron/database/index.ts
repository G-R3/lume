import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DrizzleQueryError, type DrizzleTypeError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

let database: LibraryDatabase | undefined;

let initializing = false;

export async function initializeDatabase(options: { location: string; migrationsFolder?: string }) {
  if (database || initializing) throw new Error("Library database is already initialized");

  initializing = true;

  try {
    database = await openLibraryDatabase(options.location, options.migrationsFolder);
  } finally {
    initializing = false;
  }
}

export function getDatabase() {
  if (database) return database;
  throw new Error("Library database has not been initialized");
}

export function closeDatabase() {
  if (!database) return;

  const client = database.$client;
  database = undefined;

  if (client.isOpen) client.close();
}

export async function openLibraryDatabase(
  location: string,
  migrationsFolder = join(__dirname, "drizzle"),
) {
  if (location !== ":memory:") await mkdir(dirname(location), { recursive: true });

  const client = new DatabaseSync(location);

  try {
    configureLibraryDatabase(client);

    const database = drizzle({ client });

    migrate(database, { migrationsFolder });
    validateForeignKeys(client);

    return database;
  } catch (error) {
    client.close();
    throw error;
  }
}

export type LibraryDatabase = Awaited<ReturnType<typeof openLibraryDatabase>>;

export type LibraryTransaction = Parameters<Parameters<LibraryDatabase["transaction"]>[0]>[0];

// Drizzle's top-level sync transaction type accepts async callbacks, and query failures hide the
// SQLite message behind DrizzleQueryError. Keep both constraints in one transaction boundary.
export function runImmediateTransaction<Result>(
  database: LibraryDatabase,
  action: (
    transaction: LibraryTransaction,
  ) => Result extends Promise<any>
    ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
    : Result,
) {
  try {
    return database.transaction(action, { behavior: "immediate" });
  } catch (error) {
    if (error instanceof DrizzleQueryError && error.cause) throw error.cause;
    throw error;
  }
}

function validateForeignKeys(database: DatabaseSync) {
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();

  if (foreignKeyFailures.length > 0) throw new Error("Database failed its foreign key check");
}

export function configureLibraryDatabase(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  if (!database.location()) return;

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA wal_checkpoint(PASSIVE);
  `);
}

export function getLibraryDatabasePath(userDataDirectory: string, isPackaged: boolean) {
  return join(userDataDirectory, isPackaged ? "lume.sqlite" : "lume-dev.sqlite");
}
