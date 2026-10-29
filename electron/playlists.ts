import { and, count, eq, sql } from "drizzle-orm";
import type {
  AddTrackToPlaylistResult,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistSummary,
  PlaylistTrackInput,
  PlaylistTrackRemovalInput,
} from "../shared/lib";
import { getDatabase, runImmediateTransaction, type LibraryTransaction } from "./database";
import { playlistTracks, playlists, tracks } from "./database/schema";

const playlistColumns = {
  description: playlists.description,
  id: playlists.id,
  title: playlists.title,
};

const playlistTrackColumns = {
  addedAt: playlistTracks.createdAt,
  id: playlistTracks.id,
  position: playlistTracks.position,
  trackId: playlistTracks.trackId,
};

export function getPlaylists(): PlaylistSummary[] {
  return getDatabase()
    .select({
      ...playlistColumns,
      trackCount: count(playlistTracks.id),
    })
    .from(playlists)
    .leftJoin(playlistTracks, eq(playlistTracks.playlistId, playlists.id))
    .groupBy(playlists.id)
    .orderBy(playlists.createdAt, sql`${playlists}.rowid`)
    .all();
}

export function getPlaylist(playlistId: number): PlaylistDetails | null {
  const database = getDatabase();

  const playlist = database
    .select(playlistColumns)
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) return null;

  return {
    ...playlist,
    tracks: database
      .select(playlistTrackColumns)
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position)
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
    .returning(playlistColumns)
    .get();

  return { ...playlist, trackCount: 0 } satisfies PlaylistSummary;
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
      .returning(playlistColumns)
      .get();

    const playlistTrack = appendPlaylistTrack(
      transaction,
      { playlistId: playlist.id, trackId },
      now,
    );

    return { ...playlist, tracks: [playlistTrack] } satisfies PlaylistDetails;
  });
}

export function deletePlaylist(playlistId: number) {
  const playlist = getDatabase()
    .delete(playlists)
    .where(eq(playlists.id, playlistId))
    .returning({ id: playlists.id })
    .get();

  if (!playlist) throw new Error("Playlist does not exist");
}

export function addTrackToPlaylist(input: PlaylistTrackInput): AddTrackToPlaylistResult {
  return runImmediateTransaction(getDatabase(), (transaction) => {
    requirePlaylist(transaction, input.playlistId);
    requireTrack(transaction, input.trackId);

    const duplicate = transaction
      .select({ id: playlistTracks.id })
      .from(playlistTracks)
      .where(
        and(
          eq(playlistTracks.playlistId, input.playlistId),
          eq(playlistTracks.trackId, input.trackId),
        ),
      )
      .get();

    if (duplicate) return { kind: "duplicate" };

    const track = appendPlaylistTrack(transaction, input, Date.now());

    return { kind: "added", track };
  });
}

export function confirmAddTrackToPlaylist(input: PlaylistTrackInput) {
  return runImmediateTransaction(getDatabase(), (transaction) => {
    requirePlaylist(transaction, input.playlistId);
    requireTrack(transaction, input.trackId);

    return appendPlaylistTrack(transaction, input, Date.now());
  });
}

export function removePlaylistTrack(input: PlaylistTrackRemovalInput) {
  runImmediateTransaction(getDatabase(), (transaction) => {
    requirePlaylist(transaction, input.playlistId);

    const playlistTrack = transaction
      .delete(playlistTracks)
      .where(
        and(
          eq(playlistTracks.id, input.playlistTrackId),
          eq(playlistTracks.playlistId, input.playlistId),
        ),
      )
      .returning({ id: playlistTracks.id })
      .get();

    if (!playlistTrack) {
      throw new Error("Playlist track does not exist in this playlist");
    }

    touchPlaylist(transaction, input.playlistId, Date.now());
  });
}

function requirePlaylist(database: LibraryTransaction, playlistId: number) {
  const playlist = database
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) throw new Error("Playlist does not exist");
}

function requireTrack(database: LibraryTransaction, trackId: number) {
  const track = database.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, trackId)).get();

  if (!track) throw new Error("Track does not exist");
}

function appendPlaylistTrack(database: LibraryTransaction, input: PlaylistTrackInput, now: number) {
  const playlistTrack = database
    .insert(playlistTracks)
    .values({
      createdAt: now,
      playlistId: input.playlistId,
      position:
        database
          .select({
            position: sql<number | null>`MAX(${playlistTracks.position}) + 1`,
          })
          .from(playlistTracks)
          .where(eq(playlistTracks.playlistId, input.playlistId))
          .get()?.position ?? 0,
      trackId: input.trackId,
    })
    .returning(playlistTrackColumns)
    .get();

  touchPlaylist(database, input.playlistId, now);

  return playlistTrack;
}

function touchPlaylist(database: LibraryTransaction, playlistId: number, now: number) {
  database.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId)).run();
}
