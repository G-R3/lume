import { rm } from "node:fs/promises";
import { getDevelopmentDatabasePath } from "./development-database-path.mjs";

const databasePath = getDevelopmentDatabasePath();

await Promise.all(
  [databasePath, `${databasePath}-shm`, `${databasePath}-wal`].map((path) =>
    rm(path, { force: true }),
  ),
);

console.log(`Reset development database at ${databasePath}`);
