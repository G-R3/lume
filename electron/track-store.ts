import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { TrackMetadata } from "../shared/lib";
import { runInTransaction } from "./database/transaction";
import {
  trackMetadataVersion,
  type ArtworkData,
  type ScannedTrack,
  type StoredTrackMetadata,
} from "./library";
import { isSourceScannable, markSourceTracksUnavailable } from "./library-store";

export type StoredTrack = TrackMetadata & {
  artworkId: string | null;
  available: boolean;
  id: string;
  path: string;
};

const trackMetadataColumns = `
  title, duration, format, artists, album, album_artists, year,
  track_number, track_total, disc_number, disc_total, genres, codec,
  bitrate, sample_rate, bits_per_sample, channel_count, lossless`;

export function getTracks(database: DatabaseSync): StoredTrack[] {
  return database
    .prepare(
      `SELECT id, path, available, artwork_id, ${trackMetadataColumns} FROM tracks
      ORDER BY title COLLATE NOCASE, path`,
    )
    .all()
    .map((row) => ({
      ...readTrackMetadata(row),
      artworkId: readNullableString(row.artwork_id, "tracks.artwork_id"),
      available: readBoolean(row.available, "tracks.available"),
      id: readString(row.id, "tracks.id"),
      path: readString(row.path, "tracks.path"),
    }));
}

export function getArtworkData(database: DatabaseSync, artworkId: string): ArtworkData | null {
  const artwork = database
    .prepare("SELECT media_type, data FROM artwork WHERE id = ?")
    .get(artworkId);

  if (!artwork) return null;

  return {
    data: readBytes(artwork.data, "artwork.data"),
    mediaType: readString(artwork.media_type, "artwork.media_type"),
  };
}

export function getTrackPath(database: DatabaseSync, trackId: string) {
  const track = database.prepare("SELECT path FROM tracks WHERE id = ?").get(trackId);

  return track ? readString(track.path, "tracks.path") : null;
}

export function getTrackMetadata(database: DatabaseSync, sourceId: string) {
  return new Map<string, StoredTrackMetadata>(
    database
      .prepare(
        `SELECT path, file_size, modified_at FROM tracks
        WHERE source_id = ? AND metadata_version = ?`,
      )
      .all(sourceId, trackMetadataVersion)
      .map((row) => [
        readString(row.path, "tracks.path"),
        {
          fileSize: readNumber(row.file_size, "tracks.file_size"),
          modifiedAt: readNumber(row.modified_at, "tracks.modified_at"),
        },
      ]),
  );
}

export function applySourceScan(
  database: DatabaseSync,
  sourceId: string,
  tracks: readonly ScannedTrack[],
) {
  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  runInTransaction(database, () => {
    markSourceTracksUnavailable(database, sourceId, now);

    const restoreTrack = database.prepare(
      `UPDATE tracks
      SET available = 1, updated_at = $updatedAt
      WHERE source_id = $sourceId AND path = $path`,
    );

    const saveArtwork = database.prepare(
      `INSERT OR IGNORE INTO artwork (id, media_type, data)
      VALUES ($id, $mediaType, $data)`,
    );

    const saveTrack = database.prepare(
      `INSERT INTO tracks (
        id, source_id, path, title, duration, format, file_size, modified_at,
        available, created_at, updated_at, artists, album, album_artists,
        artwork_id, year, track_number, track_total, disc_number, disc_total,
        genres, codec, bitrate, sample_rate, bits_per_sample, channel_count, lossless,
        metadata_version
      ) VALUES (
        $id, $sourceId, $path, $title, $duration, $format, $fileSize, $modifiedAt,
        1, $createdAt, $updatedAt, $artists, $album, $albumArtists,
        $artworkId, $year, $trackNumber, $trackTotal, $discNumber, $discTotal,
        $genres, $codec, $bitrate, $sampleRate, $bitsPerSample, $channelCount, $lossless,
        $metadataVersion
      )
      ON CONFLICT(path) DO UPDATE SET
        source_id = excluded.source_id,
        title = excluded.title,
        duration = excluded.duration,
        format = excluded.format,
        file_size = excluded.file_size,
        modified_at = excluded.modified_at,
        artists = excluded.artists,
        album = excluded.album,
        album_artists = excluded.album_artists,
        artwork_id = excluded.artwork_id,
        year = excluded.year,
        track_number = excluded.track_number,
        track_total = excluded.track_total,
        disc_number = excluded.disc_number,
        disc_total = excluded.disc_total,
        genres = excluded.genres,
        codec = excluded.codec,
        bitrate = excluded.bitrate,
        sample_rate = excluded.sample_rate,
        bits_per_sample = excluded.bits_per_sample,
        channel_count = excluded.channel_count,
        lossless = excluded.lossless,
        metadata_version = excluded.metadata_version,
        available = 1,
        updated_at = excluded.updated_at`,
    );

    tracks.forEach((track) => {
      if (track.kind === "unchanged") {
        restoreTrack.run({
          $path: track.path,
          $sourceId: sourceId,
          $updatedAt: now,
        });

        return;
      }

      if (track.artwork) {
        saveArtwork.run({
          $data: track.artwork.data,
          $id: track.artwork.id,
          $mediaType: track.artwork.mediaType,
        });
      }

      saveTrack.run({
        $album: track.album,
        $albumArtists: JSON.stringify(track.albumArtists),
        $artists: JSON.stringify(track.artists),
        $artworkId: track.artwork?.id ?? null,
        $bitrate: track.bitrate,
        $bitsPerSample: track.bitsPerSample,
        $channelCount: track.channelCount,
        $codec: track.codec,
        $createdAt: now,
        $discNumber: track.discNumber,
        $discTotal: track.discTotal,
        $duration: track.duration,
        $fileSize: track.fileSize,
        $format: track.format,
        $genres: JSON.stringify(track.genres),
        $id: randomUUID(),
        $lossless: track.lossless === null ? null : Number(track.lossless),
        $metadataVersion: trackMetadataVersion,
        $modifiedAt: track.modifiedAt,
        $path: track.path,
        $sampleRate: track.sampleRate,
        $sourceId: sourceId,
        $title: track.title,
        $trackNumber: track.trackNumber,
        $trackTotal: track.trackTotal,
        $updatedAt: now,
        $year: track.year,
      });
    });

    database.exec(`
      DELETE FROM artwork
      WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE tracks.artwork_id = artwork.id)
    `);

    database
      .prepare(
        `UPDATE library_sources
        SET last_scanned_at = ?, last_scan_error = NULL, updated_at = ?
        WHERE id = ?`,
      )
      .run(now, now, sourceId);
  });

  return true;
}

function readTrackMetadata(row: Record<string, SQLOutputValue>): TrackMetadata {
  return {
    album: readNullableString(row.album, "tracks.album"),
    albumArtists: readStringArray(row.album_artists, "tracks.album_artists"),
    artists: readStringArray(row.artists, "tracks.artists"),
    bitrate: readNullableFiniteNumber(row.bitrate, "tracks.bitrate"),
    bitsPerSample: readNullableNumber(row.bits_per_sample, "tracks.bits_per_sample"),
    channelCount: readNullableNumber(row.channel_count, "tracks.channel_count"),
    codec: readNullableString(row.codec, "tracks.codec"),
    discNumber: readNullableNumber(row.disc_number, "tracks.disc_number"),
    discTotal: readNullableNumber(row.disc_total, "tracks.disc_total"),
    duration: readNullableFiniteNumber(row.duration, "tracks.duration"),
    format: readString(row.format, "tracks.format"),
    genres: readStringArray(row.genres, "tracks.genres"),
    lossless: row.lossless === null ? null : readBoolean(row.lossless, "tracks.lossless"),
    title: readString(row.title, "tracks.title"),
    sampleRate: readNullableNumber(row.sample_rate, "tracks.sample_rate"),
    trackNumber: readNullableNumber(row.track_number, "tracks.track_number"),
    trackTotal: readNullableNumber(row.track_total, "tracks.track_total"),
    year: readNullableNumber(row.year, "tracks.year"),
  };
}

function readBoolean(value: SQLOutputValue | undefined, field: string) {
  const number = Number(value);

  if (number === 0 || number === 1) return number === 1;
  throw new Error(`Invalid boolean in ${field}`);
}

function readNullableNumber(value: SQLOutputValue | undefined, field: string) {
  if (value === null) return null;

  return readNumber(value, field);
}

function readNullableFiniteNumber(value: SQLOutputValue | undefined, field: string) {
  if (value === null) return null;

  const number = Number(value);

  if (Number.isFinite(number)) return number;
  throw new Error(`Invalid number in ${field}`);
}

function readNumber(value: SQLOutputValue | undefined, field: string) {
  const number = Number(value);

  if (Number.isSafeInteger(number)) return number;
  throw new Error(`Invalid number in ${field}`);
}

function readString(value: SQLOutputValue | undefined, field: string) {
  if (value === undefined || value === null || value instanceof Uint8Array) {
    throw new Error(`Invalid string in ${field}`);
  }

  return String(value);
}

function readNullableString(value: SQLOutputValue | undefined, field: string) {
  if (value === null) return null;

  return readString(value, field);
}

function readStringArray(value: SQLOutputValue | undefined, field: string) {
  const parsed: unknown = JSON.parse(readString(value, field));

  if (
    Array.isArray(parsed) &&
    parsed.every((item) => Object.prototype.toString.call(item) === "[object String]")
  ) {
    return parsed.map(String);
  }

  throw new Error(`Invalid string array in ${field}`);
}

function readBytes(value: SQLOutputValue | undefined, field: string) {
  if (value instanceof Uint8Array) return value;
  throw new Error(`Invalid bytes in ${field}`);
}
