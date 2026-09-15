import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import type {
  AddTrackToPlaylistResult,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistEntry,
  PlaylistSummary,
} from "../shared/lib";
import { runLibraryTransaction, type LibraryDatabase, type LibraryTransaction } from "./database";
import { playlistEntries, playlists, tracks } from "./database/schema";

export function getPlaylists(database: LibraryDatabase): PlaylistSummary[] {
  return database
    .select({
      description: playlists.description,
      entryCount: count(playlistEntries.id),
      id: playlists.id,
      title: playlists.title,
    })
    .from(playlists)
    .leftJoin(playlistEntries, eq(playlistEntries.playlistId, playlists.id))
    .groupBy(playlists.id)
    .orderBy(playlists.createdAt, sql`${playlists}.rowid`)
    .all();
}

export function getPlaylist(database: LibraryDatabase, playlistId: string): PlaylistDetails | null {
  const playlist = database
    .select({
      description: playlists.description,
      id: playlists.id,
      title: playlists.title,
    })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) return null;

  return {
    ...playlist,
    entries: database
      .select({
        id: playlistEntries.id,
        position: playlistEntries.position,
        trackId: playlistEntries.trackId,
      })
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(playlistEntries.position)
      .all(),
  };
}

export function createPlaylist(database: LibraryDatabase, input: PlaylistCreationInput) {
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

  return runLibraryTransaction(database, (transaction) => {
    const now = Date.now();
    transaction
      .insert(playlists)
      .values({
        createdAt: now,
        description: playlist.description,
        id: playlist.id,
        title: playlist.title,
        updatedAt: now,
      })
      .run();

    return playlist;
  });
}

export function createPlaylistFromTrack(database: LibraryDatabase, trackId: string) {
  return runLibraryTransaction(database, (transaction) => {
    const track = transaction
      .select({ title: tracks.title })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .get();

    if (!track) throw new Error("Track does not exist");

    const trackTitle = track.title.trim();

    const playlist = {
      description: null,
      entries: [{ id: randomUUID(), position: 0, trackId }],
      id: randomUUID(),
      title: trackTitle.length > 0 && trackTitle.length <= 100 ? trackTitle : "New Playlist",
    } satisfies PlaylistDetails;

    const now = Date.now();

    transaction
      .insert(playlists)
      .values({
        createdAt: now,
        description: playlist.description,
        id: playlist.id,
        title: playlist.title,
        updatedAt: now,
      })
      .run();
    transaction
      .insert(playlistEntries)
      .values({
        createdAt: now,
        id: playlist.entries[0].id,
        playlistId: playlist.id,
        position: 0,
        trackId,
      })
      .run();

    return playlist;
  });
}

export function deletePlaylist(database: LibraryDatabase, playlistId: string) {
  runLibraryTransaction(database, (transaction) => {
    const result = transaction.delete(playlists).where(eq(playlists.id, playlistId)).run();

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error("Playlist does not exist");
    }
  });
}

export function addTrackToPlaylist(
  database: LibraryDatabase,
  playlistId: string,
  trackId: string,
): AddTrackToPlaylistResult {
  return runLibraryTransaction(database, (transaction) => {
    requirePlaylistAndTrack(transaction, playlistId, trackId);

    const duplicate = transaction
      .select({ id: playlistEntries.id })
      .from(playlistEntries)
      .where(and(eq(playlistEntries.playlistId, playlistId), eq(playlistEntries.trackId, trackId)))
      .get();

    if (duplicate) return { kind: "duplicate" };

    return { entry: insertPlaylistEntry(transaction, playlistId, trackId), kind: "added" };
  });
}

export function confirmAddTrackToPlaylist(
  database: LibraryDatabase,
  playlistId: string,
  trackId: string,
) {
  return runLibraryTransaction(database, (transaction) => {
    requirePlaylistAndTrack(transaction, playlistId, trackId);

    return insertPlaylistEntry(transaction, playlistId, trackId);
  });
}

export function removePlaylistEntry(
  database: LibraryDatabase,
  playlistId: string,
  entryId: string,
) {
  runLibraryTransaction(database, (transaction) => {
    const playlist = transaction
      .select({ id: playlists.id })
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .get();

    if (!playlist) throw new Error("Playlist does not exist");

    const result = transaction
      .delete(playlistEntries)
      .where(and(eq(playlistEntries.id, entryId), eq(playlistEntries.playlistId, playlistId)))
      .run();

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error("Playlist entry does not exist in this playlist");
    }

    transaction
      .update(playlists)
      .set({ updatedAt: Date.now() })
      .where(eq(playlists.id, playlistId))
      .run();
  });
}

function requirePlaylistAndTrack(
  database: LibraryTransaction,
  playlistId: string,
  trackId: string,
) {
  const playlist = database
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) throw new Error("Playlist does not exist");

  const track = database.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, trackId)).get();

  if (!track) throw new Error("Track does not exist");
}

function insertPlaylistEntry(database: LibraryTransaction, playlistId: string, trackId: string) {
  const entry = {
    id: randomUUID(),
    position:
      database
        .select({
          position: sql<number | null>`MAX(${playlistEntries.position}) + 1`,
        })
        .from(playlistEntries)
        .where(eq(playlistEntries.playlistId, playlistId))
        .get()?.position ?? 0,
    trackId,
  } satisfies PlaylistEntry;

  const now = Date.now();

  database
    .insert(playlistEntries)
    .values({
      createdAt: now,
      id: entry.id,
      playlistId,
      position: entry.position,
      trackId,
    })
    .run();
  database.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId)).run();

  return entry;
}
