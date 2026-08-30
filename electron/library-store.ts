import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { runInTransaction } from "./database/transaction";
import type { ScannedTrack } from "./library";

export type StoredLibrarySource = {
  id: string;
  path: string;
};

export async function saveLibrarySource(
  database: DatabaseSync,
  selectedPath: string,
): Promise<StoredLibrarySource> {
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  const existing = database.prepare("SELECT id FROM library_sources WHERE path = ?").get(path);

  if (existing) return { id: readString(existing.id, "library_sources.id"), path };

  const overlappingPath = database
    .prepare("SELECT path FROM library_sources WHERE forgotten_at IS NULL")
    .all()
    .map((row) => readString(row.path, "library_sources.path"))
    .find((sourcePath) => pathsOverlap(sourcePath, path));

  if (overlappingPath) {
    throw new Error(`This folder overlaps the existing source ${overlappingPath}`);
  }

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

export function saveScannedTracks(
  database: DatabaseSync,
  sourceId: string,
  tracks: readonly ScannedTrack[],
) {
  const now = Date.now();

  runInTransaction(database, () => {
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
  });
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string) {
  const difference = relative(parent, child);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function readString(value: SQLOutputValue | undefined, field: string) {
  if (value === undefined || value === null || value instanceof Uint8Array) {
    throw new Error(`Invalid string in ${field}`);
  }

  return String(value);
}
