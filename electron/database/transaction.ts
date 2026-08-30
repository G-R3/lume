import type { DatabaseSync } from "node:sqlite";

export function runInTransaction(database: DatabaseSync, action: () => void) {
  database.exec("BEGIN IMMEDIATE");

  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
