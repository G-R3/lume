import type { Migration } from "../migration";

export const trackMetadataMigration = {
  name: "track-metadata",
  version: 3,
  up(database) {
    database.exec(`
      ALTER TABLE tracks RENAME COLUMN name TO title;

      CREATE TABLE artwork (
        id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        data BLOB NOT NULL
      ) STRICT;

      ALTER TABLE tracks ADD COLUMN artists TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE tracks ADD COLUMN album TEXT;
      ALTER TABLE tracks ADD COLUMN album_artists TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE tracks ADD COLUMN artwork_id TEXT REFERENCES artwork(id);
      ALTER TABLE tracks ADD COLUMN year INTEGER;
      ALTER TABLE tracks ADD COLUMN track_number INTEGER;
      ALTER TABLE tracks ADD COLUMN track_total INTEGER;
      ALTER TABLE tracks ADD COLUMN disc_number INTEGER;
      ALTER TABLE tracks ADD COLUMN disc_total INTEGER;
      ALTER TABLE tracks ADD COLUMN genres TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE tracks ADD COLUMN codec TEXT;
      ALTER TABLE tracks ADD COLUMN bitrate REAL;
      ALTER TABLE tracks ADD COLUMN sample_rate INTEGER;
      ALTER TABLE tracks ADD COLUMN bits_per_sample INTEGER;
      ALTER TABLE tracks ADD COLUMN channel_count INTEGER;
      ALTER TABLE tracks ADD COLUMN lossless INTEGER CHECK (lossless IN (0, 1));
      ALTER TABLE tracks ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX tracks_artwork_id ON tracks(artwork_id);
    `);
  },
} satisfies Migration;
