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
import { PLAYLIST_DESCRIPTION_MAX_LENGTH, PLAYLIST_TITLE_MAX_LENGTH } from "@shared/playlist-text";

const SOURCE_STATUSES = ["active", "off", "forgotten"] as const;

const SCAN_FAILURES = ["missing", "permission", "failed"] as const;

const SCAN_OUTCOMES = ["unscanned", "ok", ...SCAN_FAILURES] as const;

export type SourceStatusColumn = (typeof SOURCE_STATUSES)[number];

export type ScanOutcomeColumn = (typeof SCAN_OUTCOMES)[number];

function sqlList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

export const LibrarySourcesTable = sqliteTable(
  "library_sources",
  {
    id: integer("id").primaryKey(),
    path: text("path").notNull().unique(),
    status: text("status", { enum: SOURCE_STATUSES }).notNull(),
    lastScanOutcome: text("last_scan_outcome", { enum: SCAN_OUTCOMES })
      .notNull()
      .default("unscanned"),
    lastScannedAt: integer("last_scanned_at"),
    lastScanErrorMessage: text("last_scan_error_message"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("library_sources_status_check", sql`${table.status} IN (${sqlList(SOURCE_STATUSES)})`),
    check(
      "library_sources_scan_check",
      sql`(${table.lastScanOutcome} = 'unscanned' AND ${table.lastScannedAt} IS NULL AND ${table.lastScanErrorMessage} IS NULL)
        OR (${table.lastScanOutcome} = 'ok' AND ${table.lastScannedAt} IS NOT NULL AND ${table.lastScanErrorMessage} IS NULL)
        OR (${table.lastScanOutcome} IN (${sqlList(SCAN_FAILURES)}) AND ${table.lastScanErrorMessage} IS NOT NULL)`,
    ),
  ],
);

export const ArtworkTable = sqliteTable(
  "artwork",
  {
    id: text("id").notNull(),
    mediaType: text("media_type").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id] })],
);

export const TracksTable = sqliteTable(
  "tracks",
  {
    id: integer("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => LibrarySourcesTable.id),
    path: text("path").notNull().unique(),
    title: text("title").notNull(),
    duration: real("duration"),
    format: text("format").notNull(),
    fileSize: integer("file_size").notNull(),
    modifiedAt: integer("modified_at").notNull(),
    missingSince: integer("missing_since"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    artists: text("artists", { mode: "json" }).$type<string[]>().notNull(),
    album: text("album"),
    albumArtists: text("album_artists", { mode: "json" }).$type<string[]>().notNull(),
    artworkId: text("artwork_id").references(() => ArtworkTable.id),
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
    index("tracks_source_id").on(table.sourceId),
    index("tracks_artwork_id").on(table.artworkId),
    check(
      "tracks_missing_since_check",
      sql`${table.missingSince} IS NULL OR ${table.missingSince} > 0`,
    ),
    check("tracks_lossless_check", sql`${table.lossless} IN (0, 1)`),
  ],
);

export const TrackStateTable = sqliteTable(
  "track_state",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => TracksTable.id, { onDelete: "cascade" }),
    likedAt: integer("liked_at"),
  },
  (table) => [primaryKey({ columns: [table.trackId] })],
);

export const PlaylistsTable = sqliteTable(
  "playlists",
  {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("playlists_created_at").on(table.createdAt),
    check(
      "playlists_title_check",
      sql`${table.title} = trim(${table.title}) AND length(${table.title}) BETWEEN 1 AND ${sql.raw(String(PLAYLIST_TITLE_MAX_LENGTH))}`,
    ),
    check(
      "playlists_description_check",
      sql`${table.description} IS NULL OR length(${table.description}) BETWEEN 1 AND ${sql.raw(String(PLAYLIST_DESCRIPTION_MAX_LENGTH))}`,
    ),
  ],
);

export const PlaylistTracksTable = sqliteTable(
  "playlist_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => PlaylistsTable.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => TracksTable.id),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique().on(table.playlistId, table.position),
    index("playlist_entries_track").on(table.playlistId, table.trackId),
    check("playlist_entries_position_check", sql`${table.position} >= 0`),
  ],
);

export const PlaybackSessionTable = sqliteTable(
  "playback_session",
  {
    id: integer("id").primaryKey(),
    payload: text("payload").notNull(),
    position: real("position").notNull(),
  },
  (table) => [
    check("playback_session_singleton_check", sql`${table.id} = 1`),
    check("playback_session_position_check", sql`${table.position} >= 0`),
  ],
);

export const AppStateTable = sqliteTable(
  "app_state",
  {
    id: integer("id").primaryKey(),
    onboardedAt: integer("onboarded_at").notNull(),
  },
  (table) => [check("app_state_singleton_check", sql`${table.id} = 1`)],
);
