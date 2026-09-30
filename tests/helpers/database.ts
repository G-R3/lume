import { join } from "node:path";
import { afterEach } from "vite-plus/test";
import { closeDatabase, getDatabase, initializeDatabase } from "../../electron/database";

afterEach(closeDatabase);

export async function openTestDatabase(location = ":memory:") {
  await initializeDatabase({
    location,
    migrationsFolder: join(import.meta.dirname, "../../drizzle"),
  });

  return getDatabase();
}
