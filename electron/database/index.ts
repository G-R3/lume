import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

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
