import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { LibrarySource } from "../shared/lib";
import { runInTransaction } from "./database/transaction";
import type { ScannedTrack } from "./library";

export type StoredTrack = {
  duration: number | null;
  format: string;
  id: string;
  name: string;
  path: string;
};

export function getLibrarySources(database: DatabaseSync): LibrarySource[] {
  return database
    .prepare(
      `SELECT id, path, enabled, last_scanned_at, last_scan_error FROM library_sources
      WHERE forgotten_at IS NULL
      ORDER BY created_at`,
    )
    .all()
    .map(readLibrarySource);
}

export function getEnabledLibrarySources(database: DatabaseSync): LibrarySource[] {
  return database
    .prepare(
      `SELECT id, path, enabled, last_scanned_at, last_scan_error FROM library_sources
      WHERE enabled = 1 AND forgotten_at IS NULL
      ORDER BY created_at`,
    )
    .all()
    .map(readLibrarySource);
}

export function getAvailableTracks(database: DatabaseSync): StoredTrack[] {
  return database
    .prepare(
      `SELECT id, path, name, duration, format FROM tracks
      WHERE available = 1
      ORDER BY name COLLATE NOCASE, path`,
    )
    .all()
    .map((row) => ({
      duration: row.duration === null ? null : Number(row.duration),
      format: readString(row.format, "tracks.format"),
      id: readString(row.id, "tracks.id"),
      name: readString(row.name, "tracks.name"),
      path: readString(row.path, "tracks.path"),
    }));
}

export async function saveLibrarySource(
  database: DatabaseSync,
  selectedPath: string,
): Promise<Pick<LibrarySource, "id" | "path">> {
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  const existing = database.prepare("SELECT id FROM library_sources WHERE path = ?").get(path);

  if (existing) {
    const id = readString(existing.id, "library_sources.id");
    requireNoOverlappingSource(database, path, id);
    database
      .prepare(
        `UPDATE library_sources
        SET enabled = 1, forgotten_at = NULL, updated_at = ?
        WHERE id = ?`,
      )
      .run(Date.now(), id);
    return { id, path };
  }

  requireNoOverlappingSource(database, path);

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

export function setLibrarySourceEnabled(
  database: DatabaseSync,
  sourceId: string,
  enabled: boolean,
) {
  const now = Date.now();

  runInTransaction(database, () => {
    const result = database
      .prepare(
        `UPDATE library_sources
        SET enabled = ?, updated_at = ?
        WHERE id = ? AND forgotten_at IS NULL`,
      )
      .run(Number(enabled), now, sourceId);
    requireLibrarySource(result.changes, sourceId);
    if (!enabled) markSourceTracksUnavailable(database, sourceId, now);
  });
}

export function forgetLibrarySource(database: DatabaseSync, sourceId: string) {
  const now = Date.now();

  runInTransaction(database, () => {
    const result = database
      .prepare(
        `UPDATE library_sources
        SET enabled = 0, forgotten_at = ?, updated_at = ?
        WHERE id = ? AND forgotten_at IS NULL`,
      )
      .run(now, now, sourceId);
    requireLibrarySource(result.changes, sourceId);
    markSourceTracksUnavailable(database, sourceId, now);
  });
}

export function applySourceScan(
  database: DatabaseSync,
  sourceId: string,
  tracks: readonly ScannedTrack[],
) {
  const now = Date.now();

  runInTransaction(database, () => {
    markSourceTracksUnavailable(database, sourceId, now);

    const saveTrack = database.prepare(
      `INSERT INTO tracks (
        id, source_id, path, name, duration, format, file_size, modified_at,
        available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
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
}

export function recordLibrarySourceScanFailure(
  database: DatabaseSync,
  sourceId: string,
  error: string,
) {
  const now = Date.now();

  runInTransaction(database, () => {
    markSourceTracksUnavailable(database, sourceId, now);
    database
      .prepare(
        `UPDATE library_sources
        SET last_scanned_at = ?, last_scan_error = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(now, error, now, sourceId);
  });
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

function requireNoOverlappingSource(database: DatabaseSync, path: string, sourceId?: string) {
  const overlappingPath = database
    .prepare("SELECT id, path FROM library_sources")
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

function requireLibrarySource(changes: number | bigint, sourceId: string) {
  if (changes === 1 || changes === 1n) return;
  throw new Error(`Library source ${sourceId} is not active`);
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string) {
  const difference = relative(parent, child);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function readLibrarySource(row: Record<string, SQLOutputValue>): LibrarySource {
  return {
    enabled: readBoolean(row.enabled, "library_sources.enabled"),
    id: readString(row.id, "library_sources.id"),
    lastScanError:
      row.last_scan_error === null
        ? null
        : readString(row.last_scan_error, "library_sources.last_scan_error"),
    lastScannedAt: readNullableNumber(row.last_scanned_at, "library_sources.last_scanned_at"),
    path: readString(row.path, "library_sources.path"),
  };
}

function readBoolean(value: SQLOutputValue | undefined, field: string) {
  const number = Number(value);

  if (number === 0 || number === 1) return number === 1;
  throw new Error(`Invalid boolean in ${field}`);
}

function readNullableNumber(value: SQLOutputValue | undefined, field: string) {
  if (value === null) return null;

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
