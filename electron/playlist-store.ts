import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type {
  AddTrackToPlaylistResult,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistEntry,
  PlaylistSummary,
} from "../shared/lib";
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

export function getPlaylist(database: DatabaseSync, playlistId: string): PlaylistDetails | null {
  const playlist = database
    .prepare("SELECT id, title, description FROM playlists WHERE id = ?")
    .get(playlistId);

  if (!playlist) return null;

  return {
    description:
      playlist.description === null
        ? null
        : readString(playlist.description, "playlists.description"),
    entries: database
      .prepare(
        `SELECT id, track_id, position FROM playlist_entries
        WHERE playlist_id = ?
        ORDER BY position`,
      )
      .all(playlistId)
      .map((entry) => ({
        id: readString(entry.id, "playlist_entries.id"),
        position: readNumber(entry.position, "playlist_entries.position"),
        trackId: readString(entry.track_id, "playlist_entries.track_id"),
      })),
    id: readString(playlist.id, "playlists.id"),
    title: readString(playlist.title, "playlists.title"),
  };
}

export function createPlaylist(database: DatabaseSync, input: PlaylistCreationInput) {
  const title = input.title.trim();
  const description = input.description?.trim() || null;

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
  return runInTransaction(database, () => {
    const now = Date.now();
    database
      .prepare(
        `INSERT INTO playlists (id, title, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(playlist.id, playlist.title, playlist.description, now, now);

    return playlist;
  });
}

export function createPlaylistFromTrack(database: DatabaseSync, trackId: string) {
  return runInTransaction(database, () => {
    const track = database.prepare("SELECT name FROM tracks WHERE id = ?").get(trackId);

    if (!track) throw new Error("Track does not exist");

    const trackName = readString(track.name, "tracks.name").trim();
    const playlist = {
      description: null,
      entries: [{ id: randomUUID(), position: 0, trackId }],
      id: randomUUID(),
      title: trackName.length > 0 && trackName.length <= 100 ? trackName : "New Playlist",
    } satisfies PlaylistDetails;
    const now = Date.now();

    database
      .prepare(
        `INSERT INTO playlists (id, title, description, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?)`,
      )
      .run(playlist.id, playlist.title, now, now);
    database
      .prepare(
        `INSERT INTO playlist_entries (id, playlist_id, track_id, position, created_at)
        VALUES (?, ?, ?, 0, ?)`,
      )
      .run(playlist.entries[0].id, playlist.id, trackId, now);

    return playlist;
  });
}

export function deletePlaylist(database: DatabaseSync, playlistId: string) {
  runInTransaction(database, () => {
    const result = database.prepare("DELETE FROM playlists WHERE id = ?").run(playlistId);

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error("Playlist does not exist");
    }
  });
}

export function addTrackToPlaylist(
  database: DatabaseSync,
  playlistId: string,
  trackId: string,
): AddTrackToPlaylistResult {
  return runInTransaction(database, () => {
    requirePlaylistAndTrack(database, playlistId, trackId);

    const duplicate = database
      .prepare("SELECT 1 FROM playlist_entries WHERE playlist_id = ? AND track_id = ? LIMIT 1")
      .get(playlistId, trackId);

    if (duplicate) return { kind: "duplicate" };

    return { entry: insertPlaylistEntry(database, playlistId, trackId), kind: "added" };
  });
}

export function confirmAddTrackToPlaylist(
  database: DatabaseSync,
  playlistId: string,
  trackId: string,
) {
  return runInTransaction(database, () => {
    requirePlaylistAndTrack(database, playlistId, trackId);

    return insertPlaylistEntry(database, playlistId, trackId);
  });
}

function requirePlaylistAndTrack(database: DatabaseSync, playlistId: string, trackId: string) {
  const playlist = database.prepare("SELECT 1 FROM playlists WHERE id = ?").get(playlistId);

  if (!playlist) {
    throw new Error("Playlist does not exist");
  }

  const track = database.prepare("SELECT 1 FROM tracks WHERE id = ?").get(trackId);

  if (!track) {
    throw new Error("Track does not exist");
  }
}

function insertPlaylistEntry(database: DatabaseSync, playlistId: string, trackId: string) {
  const entry = {
    id: randomUUID(),
    position: readNumber(
      database
        .prepare(
          `SELECT COALESCE(MAX(position) + 1, 0) AS position
          FROM playlist_entries WHERE playlist_id = ?`,
        )
        .get(playlistId)?.position,
      "playlist_entries.position",
    ),
    trackId,
  } satisfies PlaylistEntry;
  const now = Date.now();

  database
    .prepare(
      `INSERT INTO playlist_entries (id, playlist_id, track_id, position, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    )
    .run(entry.id, playlistId, trackId, entry.position, now);
  database.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now, playlistId);

  return entry;
}

export function removePlaylistEntry(database: DatabaseSync, playlistId: string, entryId: string) {
  runInTransaction(database, () => {
    const playlist = database.prepare("SELECT 1 FROM playlists WHERE id = ?").get(playlistId);

    if (!playlist) {
      throw new Error("Playlist does not exist");
    }

    const result = database
      .prepare("DELETE FROM playlist_entries WHERE id = ? AND playlist_id = ?")
      .run(entryId, playlistId);

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error("Playlist entry does not exist in this playlist");
    }

    database
      .prepare("UPDATE playlists SET updated_at = ? WHERE id = ?")
      .run(Date.now(), playlistId);
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
