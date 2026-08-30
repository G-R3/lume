import type { Migration } from "../migration";

export const initialLibraryMigration = {
  name: "initial-library",
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE library_sources (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        forgotten_at INTEGER,
        last_scanned_at INTEGER,
        last_scan_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE tracks (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES library_sources(id),
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        duration REAL,
        format TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX tracks_source_id ON tracks(source_id);
      CREATE INDEX tracks_available ON tracks(available);

      CREATE TABLE track_state (
        track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
        starred_at INTEGER
      ) STRICT;
    `);
  },
} satisfies Migration;
