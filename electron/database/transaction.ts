import type { DatabaseSync } from "node:sqlite";

export function runInTransaction<Result>(database: DatabaseSync, action: () => Result) {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = action();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
