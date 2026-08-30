import type { Migration } from "./migration";
import { initialLibraryMigration } from "./migrations/001-initial-library";

export const libraryMigrations = [initialLibraryMigration] satisfies readonly Migration[];

export const currentSchemaVersion = libraryMigrations.at(-1)?.version ?? 0;
