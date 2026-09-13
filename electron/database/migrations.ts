import type { Migration } from "./migration";
import { initialLibraryMigration } from "./migrations/001-initial-library";
import { playlistsMigration } from "./migrations/002-playlists";
import { trackMetadataMigration } from "./migrations/003-track-metadata";

export const libraryMigrations = [
  initialLibraryMigration,
  playlistsMigration,
  trackMetadataMigration,
] satisfies readonly Migration[];
