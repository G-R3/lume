import type { Migration } from "./migration";
import { initialLibraryMigration } from "./migrations/001-initial-library";
import { playlistsMigration } from "./migrations/002-playlists";

export const libraryMigrations = [
  initialLibraryMigration,
  playlistsMigration,
] satisfies readonly Migration[];
