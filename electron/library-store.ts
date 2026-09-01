import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { LibrarySource } from "../shared/lib";
import { runInTransaction } from "./database/transaction";
import type { ScannedTrack, TrackMetadata } from "./library";

export type StoredTrack = {
  available: boolean;
  duration: number | null;
  format: string;
  id: string;
  name: string;
  path: string;
};

const sourceColumns = `
  library_sources.id,
  library_sources.path,
  library_sources.enabled,
  library_sources.last_scanned_at,
  library_sources.last_scan_error,
  (
    SELECT COUNT(*) FROM tracks
    WHERE tracks.source_id = library_sources.id AND tracks.available = 1
  ) AS track_count`;

export function getSources(database: DatabaseSync): LibrarySource[] {
  return database
    .prepare(
      `SELECT ${sourceColumns} FROM library_sources
      WHERE forgotten_at IS NULL
      ORDER BY created_at`,
    )
    .all()
    .map(readSource);
}

export function getEnabledSources(database: DatabaseSync): LibrarySource[] {
  return database
    .prepare(
      `SELECT ${sourceColumns} FROM library_sources
      WHERE enabled = 1 AND forgotten_at IS NULL
      ORDER BY created_at`,
    )
    .all()
    .map(readSource);
}

export function getSource(database: DatabaseSync, sourceId: string): LibrarySource {
  const source = database
    .prepare(
      `SELECT ${sourceColumns} FROM library_sources
      WHERE id = ? AND forgotten_at IS NULL`,
    )
    .get(sourceId);

  if (source) return readSource(source);
  throw new Error(`Library source ${sourceId} does not exist`);
}

export function hasForgottenSources(database: DatabaseSync) {
  return readBoolean(
    database
      .prepare(
        "SELECT EXISTS(SELECT 1 FROM library_sources WHERE forgotten_at IS NOT NULL) AS value",
      )
      .get()?.value,
    "library_sources.forgotten",
  );
}

export function getTracks(database: DatabaseSync): StoredTrack[] {
  return database
    .prepare(
      `SELECT id, path, name, duration, format, available FROM tracks
      ORDER BY name COLLATE NOCASE, path`,
    )
    .all()
    .map((row) => ({
      available: readBoolean(row.available, "tracks.available"),
      duration: row.duration === null ? null : Number(row.duration),
      format: readString(row.format, "tracks.format"),
      id: readString(row.id, "tracks.id"),
      name: readString(row.name, "tracks.name"),
      path: readString(row.path, "tracks.path"),
    }));
}

export function getTrackMetadata(database: DatabaseSync, sourceId: string) {
  return new Map<string, TrackMetadata>(
    database
      .prepare(
        `SELECT path, duration, file_size, modified_at FROM tracks
        WHERE source_id = ?`,
      )
      .all(sourceId)
      .map((row) => [
        readString(row.path, "tracks.path"),
        {
          duration: row.duration === null ? null : Number(row.duration),
          fileSize: readNumber(row.file_size, "tracks.file_size"),
          modifiedAt: readNumber(row.modified_at, "tracks.modified_at"),
        },
      ]),
  );
}

export async function saveSource(
  database: DatabaseSync,
  selectedPath: string,
): Promise<Pick<LibrarySource, "id" | "path">> {
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  const existing = database.prepare("SELECT id FROM library_sources WHERE path = ?").get(path);

  if (existing) {
    const id = readString(existing.id, "library_sources.id");
    rejectSourceOverlap(database, path, id);
    database
      .prepare(
        `UPDATE library_sources
        SET enabled = 1, forgotten_at = NULL, updated_at = ?
        WHERE id = ?`,
      )
      .run(Date.now(), id);
    return { id, path };
  }

  rejectSourceOverlap(database, path);

  const id = randomUUID();
  const now = Date.now();
  database
    .prepare(
      `INSERT INTO library_sources (
        id, path, enabled, created_at, updated_at
      ) VALUES (?, ?, 1, ?, ?)`,
    )
    .run(id, path, now, now);

  return { id, path };
}

export function enableSource(database: DatabaseSync, sourceId: string) {
  const result = database
    .prepare(
      `UPDATE library_sources
      SET enabled = 1, updated_at = ?
      WHERE id = ? AND forgotten_at IS NULL`,
    )
    .run(Date.now(), sourceId);

  if (result.changes !== 1 && result.changes !== 1n) {
    throw new Error(`Library source ${sourceId} is not active`);
  }
}

export function disableSource(database: DatabaseSync, sourceId: string) {
  const now = Date.now();

  runInTransaction(database, () => {
    const result = database
      .prepare(
        `UPDATE library_sources
        SET enabled = 0, updated_at = ?
        WHERE id = ? AND forgotten_at IS NULL`,
      )
      .run(now, sourceId);

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Library source ${sourceId} is not active`);
    }

    markSourceTracksUnavailable(database, sourceId, now);
  });
}

export function forgetSource(database: DatabaseSync, sourceId: string) {
  const now = Date.now();

  runInTransaction(database, () => {
    const result = database
      .prepare(
        `UPDATE library_sources
        SET enabled = 0, forgotten_at = ?, updated_at = ?
        WHERE id = ? AND forgotten_at IS NULL`,
      )
      .run(now, now, sourceId);

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Library source ${sourceId} is not active`);
    }

    markSourceTracksUnavailable(database, sourceId, now);
  });
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

    const saveTrack = database.prepare(
      `INSERT INTO tracks (
        id, source_id, path, name, duration, format, file_size, modified_at,
        available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        source_id = excluded.source_id,
        name = excluded.name,
        duration = excluded.duration,
        format = excluded.format,
        file_size = excluded.file_size,
        modified_at = excluded.modified_at,
        available = 1,
        updated_at = excluded.updated_at`,
    );

    tracks.forEach((track) => {
      saveTrack.run(
        randomUUID(),
        sourceId,
        track.path,
        track.name,
        track.duration,
        track.format,
        track.fileSize,
        track.modifiedAt,
        now,
        now,
      );
    });

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

export function applyScanFailure(database: DatabaseSync, sourceId: string, error: string) {
  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  runInTransaction(database, () => {
    markSourceTracksUnavailable(database, sourceId, now);
    database
      .prepare(
        `UPDATE library_sources
        SET last_scan_error = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(error, now, sourceId);
  });

  return true;
}

function isSourceScannable(database: DatabaseSync, sourceId: string) {
  const source = database
    .prepare("SELECT enabled, forgotten_at FROM library_sources WHERE id = ?")
    .get(sourceId);

  return (
    source !== undefined &&
    readBoolean(source.enabled, "library_sources.enabled") &&
    source.forgotten_at === null
  );
}

function markSourceTracksUnavailable(database: DatabaseSync, sourceId: string, now: number) {
  database
    .prepare(
      `UPDATE tracks
      SET available = 0, updated_at = ?
      WHERE source_id = ? AND available = 1`,
    )
    .run(now, sourceId);
}

function rejectSourceOverlap(database: DatabaseSync, path: string, sourceId?: string) {
  const overlappingPath = database
    .prepare("SELECT id, path FROM library_sources WHERE forgotten_at IS NULL")
    .all()
    .find(
      (row) =>
        readString(row.id, "library_sources.id") !== sourceId &&
        pathsOverlap(readString(row.path, "library_sources.path"), path),
    );

  if (overlappingPath) {
    throw new Error(
      `This folder overlaps the existing source ${readString(overlappingPath.path, "library_sources.path")}`,
    );
  }
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string) {
  const difference = relative(parent, child);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function readSource(row: Record<string, SQLOutputValue>): LibrarySource {
  return {
    enabled: readBoolean(row.enabled, "library_sources.enabled"),
    id: readString(row.id, "library_sources.id"),
    lastScanError:
      row.last_scan_error === null
        ? null
        : readString(row.last_scan_error, "library_sources.last_scan_error"),
    lastScannedAt: readNullableNumber(row.last_scanned_at, "library_sources.last_scanned_at"),
    path: readString(row.path, "library_sources.path"),
    trackCount: readNumber(row.track_count, "library_sources.track_count"),
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
