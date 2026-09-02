import type { Migration } from "../migration";

export const playlistsMigration = {
  name: "playlists",
  version: 2,
  up(database) {
    database.exec(`
      CREATE TABLE playlists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (
          title = trim(title) AND length(title) BETWEEN 1 AND 100
        ),
        description TEXT CHECK (
          description IS NULL OR length(description) BETWEEN 1 AND 300
        ),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX playlists_created_at ON playlists(created_at);

      CREATE TABLE playlist_entries (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL REFERENCES tracks(id),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        UNIQUE (playlist_id, position)
      ) STRICT;

      CREATE INDEX playlist_entries_track ON playlist_entries(playlist_id, track_id);
    `);
  },
} satisfies Migration;
