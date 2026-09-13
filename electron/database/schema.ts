import { sql } from "drizzle-orm";
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const librarySources = sqliteTable(
  "library_sources",
  {
    id: text("id").notNull(),
    path: text("path").notNull().unique(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    forgottenAt: integer("forgotten_at"),
    lastScannedAt: integer("last_scanned_at"),
    lastScanError: text("last_scan_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    check("library_sources_enabled_check", sql`${table.enabled} IN (0, 1)`),
  ],
);

export const artwork = sqliteTable(
  "artwork",
  {
    id: text("id").notNull(),
    mediaType: text("media_type").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id] })],
);

export const tracks = sqliteTable(
  "tracks",
  {
    id: text("id").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => librarySources.id),
    path: text("path").notNull().unique(),
    title: text("title").notNull(),
    duration: real("duration"),
    format: text("format").notNull(),
    fileSize: integer("file_size").notNull(),
    modifiedAt: integer("modified_at").notNull(),
    available: integer("available", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    artists: text("artists", { mode: "json" }).$type<string[]>().notNull(),
    album: text("album"),
    albumArtists: text("album_artists", { mode: "json" }).$type<string[]>().notNull(),
    artworkId: text("artwork_id").references(() => artwork.id),
    year: integer("year"),
    trackNumber: integer("track_number"),
    trackTotal: integer("track_total"),
    discNumber: integer("disc_number"),
    discTotal: integer("disc_total"),
    genres: text("genres", { mode: "json" }).$type<string[]>().notNull(),
    codec: text("codec"),
    bitrate: real("bitrate"),
    sampleRate: integer("sample_rate"),
    bitsPerSample: integer("bits_per_sample"),
    channelCount: integer("channel_count"),
    lossless: integer("lossless", { mode: "boolean" }),
    metadataVersion: integer("metadata_version").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("tracks_source_id").on(table.sourceId),
    index("tracks_available").on(table.available),
    index("tracks_artwork_id").on(table.artworkId),
    check("tracks_available_check", sql`${table.available} IN (0, 1)`),
    check("tracks_lossless_check", sql`${table.lossless} IN (0, 1)`),
  ],
);

export const trackState = sqliteTable(
  "track_state",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    starredAt: integer("starred_at"),
  },
  (table) => [primaryKey({ columns: [table.trackId] })],
);

export const playlists = sqliteTable(
  "playlists",
  {
    id: text("id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("playlists_created_at").on(table.createdAt),
    check(
      "playlists_title_check",
      sql`${table.title} = trim(${table.title}) AND length(${table.title}) BETWEEN 1 AND 100`,
    ),
    check(
      "playlists_description_check",
      sql`${table.description} IS NULL OR length(${table.description}) BETWEEN 1 AND 300`,
    ),
  ],
);

export const playlistEntries = sqliteTable(
  "playlist_entries",
  {
    id: text("id").notNull(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique().on(table.playlistId, table.position),
    index("playlist_entries_track").on(table.playlistId, table.trackId),
    check("playlist_entries_position_check", sql`${table.position} >= 0`),
  ],
);
