import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { PlaylistCreationInput, PlaylistSummary } from "../shared/lib";
import { runInTransaction } from "./database/transaction";

export function getPlaylists(database: DatabaseSync): PlaylistSummary[] {
  return database
    .prepare(
      `SELECT
        playlists.id,
        playlists.title,
        playlists.description,
        COUNT(playlist_entries.id) AS entry_count
      FROM playlists
      LEFT JOIN playlist_entries ON playlist_entries.playlist_id = playlists.id
      GROUP BY playlists.id
      ORDER BY playlists.created_at, playlists.rowid`,
    )
    .all()
    .map(readPlaylistSummary);
}

export function createPlaylist(database: DatabaseSync, input: PlaylistCreationInput) {
  const title = input.title.trim();
  const description = input.description?.trim() ? input.description : null;

  if (title.length === 0 || title.length > 100) {
    throw new Error("Playlist titles must contain between 1 and 100 characters");
  }

  if (description !== null && description.length > 300) {
    throw new Error("Playlist descriptions cannot exceed 300 characters");
  }

  const playlist = {
    description,
    entryCount: 0,
    id: randomUUID(),
    title,
  } satisfies PlaylistSummary;
  const now = Date.now();

  runInTransaction(database, () => {
    database
      .prepare(
        `INSERT INTO playlists (id, title, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(playlist.id, playlist.title, playlist.description, now, now);
  });

  return playlist;
}

export function deletePlaylist(database: DatabaseSync, playlistId: string) {
  if (!playlistId) {
    throw new Error("Playlist id is missing");
  }

  runInTransaction(database, () => {
    database.prepare(`DELETE FROM playlists WHERE id = ?`).run(playlistId);
  });
}

function readPlaylistSummary(row: Record<string, SQLOutputValue>): PlaylistSummary {
  return {
    description:
      row.description === null ? null : readString(row.description, "playlists.description"),
    entryCount: readNumber(row.entry_count, "playlist_entries.count"),
    id: readString(row.id, "playlists.id"),
    title: readString(row.title, "playlists.title"),
  };
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
