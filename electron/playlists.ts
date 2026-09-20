import { and, count, eq, sql } from "drizzle-orm";
import type {
  AddTrackToPlaylistResult,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistSummary,
} from "../shared/lib";
import { getDatabase, runImmediateTransaction, type LibraryTransaction } from "./database";
import { playlistEntries, playlists, tracks } from "./database/schema";

export function getPlaylists(): PlaylistSummary[] {
  return getDatabase()
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

export function getPlaylist(playlistId: number): PlaylistDetails | null {
  const database = getDatabase();

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

export function createPlaylist(input: PlaylistCreationInput) {
  const title = input.title.trim();
  const description = input.description?.trim() || null;

  if (title.length === 0 || title.length > 100) {
    throw new Error("Playlist titles must contain between 1 and 100 characters");
  }

  if (description !== null && description.length > 300) {
    throw new Error("Playlist descriptions cannot exceed 300 characters");
  }

  const now = Date.now();

  const playlist = getDatabase()
    .insert(playlists)
    .values({
      createdAt: now,
      description,
      title,
      updatedAt: now,
    })
    .returning({
      description: playlists.description,
      id: playlists.id,
      title: playlists.title,
    })
    .get();

  return { ...playlist, entryCount: 0 } satisfies PlaylistSummary;
}

export function createPlaylistFromTrack(trackId: number) {
  return runImmediateTransaction(getDatabase(), (transaction) => {
    const track = transaction
      .select({ title: tracks.title })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .get();

    if (!track) throw new Error("Track does not exist");

    const trackTitle = track.title.trim();

    const now = Date.now();

    const playlist = transaction
      .insert(playlists)
      .values({
        createdAt: now,
        description: null,
        title: trackTitle.length > 0 && trackTitle.length <= 100 ? trackTitle : "New Playlist",
        updatedAt: now,
      })
      .returning({
        description: playlists.description,
        id: playlists.id,
        title: playlists.title,
      })
      .get();

    const entry = transaction
      .insert(playlistEntries)
      .values({
        createdAt: now,
        playlistId: playlist.id,
        position: 0,
        trackId,
      })
      .returning({
        id: playlistEntries.id,
        position: playlistEntries.position,
        trackId: playlistEntries.trackId,
      })
      .get();

    return { ...playlist, entries: [entry] } satisfies PlaylistDetails;
  });
}

export function deletePlaylist(playlistId: number) {
  const result = getDatabase().delete(playlists).where(eq(playlists.id, playlistId)).run();

  if (result.changes !== 1 && result.changes !== 1n) throw new Error("Playlist does not exist");
}

export function addTrackToPlaylist(playlistId: number, trackId: number): AddTrackToPlaylistResult {
  return runImmediateTransaction(getDatabase(), (transaction) => {
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

export function confirmAddTrackToPlaylist(playlistId: number, trackId: number) {
  return runImmediateTransaction(getDatabase(), (transaction) => {
    requirePlaylistAndTrack(transaction, playlistId, trackId);

    return insertPlaylistEntry(transaction, playlistId, trackId);
  });
}

export function removePlaylistEntry(playlistId: number, entryId: number) {
  runImmediateTransaction(getDatabase(), (transaction) => {
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
  playlistId: number,
  trackId: number,
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

function insertPlaylistEntry(database: LibraryTransaction, playlistId: number, trackId: number) {
  const now = Date.now();

  const entry = database
    .insert(playlistEntries)
    .values({
      createdAt: now,
      playlistId,
      position:
        database
          .select({
            position: sql<number | null>`MAX(${playlistEntries.position}) + 1`,
          })
          .from(playlistEntries)
          .where(eq(playlistEntries.playlistId, playlistId))
          .get()?.position ?? 0,
      trackId,
    })
    .returning({
      id: playlistEntries.id,
      position: playlistEntries.position,
      trackId: playlistEntries.trackId,
    })
    .get();

  database.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId)).run();

  return entry;
}
