import { and, count, eq, inArray, sql } from "drizzle-orm";
import type {
  AddTracksToPlaylistInput,
  AddTracksToPlaylistResult,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistRead,
  PlaylistSummary,
  RemovePlaylistTracksInput,
} from "@shared/library";
import {
  normalizePlaylistText,
  playlistDescriptionMaxLength,
  playlistTitleMaxLength,
} from "@shared/playlists";
import { getDatabase, parameterChunks, type LibraryTransaction } from "./database";
import { commitLibrary, currentLibraryRevision } from "./library-events";
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

export function getPlaylist(playlistId: number): PlaylistRead {
  const database = getDatabase();

  const playlist = database
    .select(playlistColumns)
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  return {
    revision: currentLibraryRevision(),
    playlist: playlist
      ? {
          ...playlist,
          tracks: database
            .select(playlistTrackColumns)
            .from(playlistTracks)
            .where(eq(playlistTracks.playlistId, playlistId))
            .orderBy(playlistTracks.position)
            .all(),
        }
      : null,
  };
}

export function createPlaylist(input: PlaylistCreationInput): PlaylistDetails {
  const { description, title } = normalizePlaylistText(input);

  if (title.length === 0 || title.length > playlistTitleMaxLength) {
    throw new Error(
      `Playlist titles must contain between 1 and ${playlistTitleMaxLength} characters`,
    );
  }

  if (description !== null && description.length > playlistDescriptionMaxLength) {
    throw new Error(
      `Playlist descriptions cannot exceed ${playlistDescriptionMaxLength} characters`,
    );
  }

  return commitLibrary(
    getDatabase(),
    (transaction) => {
      requireTracks(transaction, input.trackIds);

      const now = Date.now();

      const playlist = transaction
        .insert(playlists)
        .values({
          createdAt: now,
          description,
          title,
          updatedAt: now,
        })
        .returning(playlistColumns)
        .get();

      return {
        ...playlist,
        tracks: appendPlaylistTracks(transaction, playlist.id, input.trackIds, now),
      };
    },
    (playlist, revision) => ({ kind: "playlist-created", revision, playlist }),
  );
}

export function deletePlaylist(playlistId: number) {
  commitLibrary(
    getDatabase(),
    (transaction) => {
      const playlist = transaction
        .delete(playlists)
        .where(eq(playlists.id, playlistId))
        .returning({ id: playlists.id })
        .get();

      if (!playlist) throw new Error("Playlist does not exist");
    },
    (_result, revision) => ({ kind: "playlist-deleted", revision, playlistId }),
  );
}

export function addTracksToPlaylist(input: AddTracksToPlaylistInput): AddTracksToPlaylistResult {
  const { result } = commitLibrary(
    getDatabase(),
    (transaction) => {
      requirePlaylist(transaction, input.playlistId);
      requireTracks(transaction, input.trackIds);

      const outcome = (result: AddTracksToPlaylistResult) => ({
        result,
        trackCount: playlistTrackCount(transaction, input.playlistId),
      });

      const append = (trackIds: readonly number[]) =>
        outcome({
          kind: "added",
          tracks: appendPlaylistTracks(transaction, input.playlistId, trackIds, Date.now()),
        });

      if (input.duplicates === "allow") return append(input.trackIds);

      const existingTrackIds = trackIdsInPlaylist(transaction, input.playlistId, input.trackIds);
      const newTrackIds = [...new Set(input.trackIds)].filter((id) => !existingTrackIds.has(id));

      if (input.duplicates === "skip") return append(newTrackIds);

      if (existingTrackIds.size === 0) return append(input.trackIds);

      return outcome({
        kind: "duplicate",
        alreadyInPlaylist: input.trackIds.filter((trackId) => existingTrackIds.has(trackId)).length,
        newTrackCount: newTrackIds.length,
      });
    },
    ({ result, trackCount }, revision) => ({
      kind: "playlist-tracks-added",
      revision,
      playlistId: input.playlistId,
      tracks: result.kind === "added" ? result.tracks : [],
      trackCount,
    }),
  );

  return result;
}

export function removePlaylistTracks(input: RemovePlaylistTracksInput) {
  const playlistTrackIds = [...new Set(input.playlistTrackIds)];
  const chunks = parameterChunks(playlistTrackIds);

  const inPlaylist = (ids: readonly number[]) =>
    and(eq(playlistTracks.playlistId, input.playlistId), inArray(playlistTracks.id, ids));

  commitLibrary(
    getDatabase(),
    (transaction) => {
      requirePlaylist(transaction, input.playlistId);

      const ownedCount = chunks.reduce(
        (total, ids) =>
          total +
          (transaction.select({ count: count() }).from(playlistTracks).where(inPlaylist(ids)).get()
            ?.count ?? 0),
        0,
      );

      if (ownedCount !== playlistTrackIds.length) {
        throw new Error("Playlist track does not exist in this playlist");
      }

      for (const ids of chunks) transaction.delete(playlistTracks).where(inPlaylist(ids)).run();

      touchPlaylist(transaction, input.playlistId, Date.now());

      return playlistTrackCount(transaction, input.playlistId);
    },
    (trackCount, revision) => ({
      kind: "playlist-tracks-removed",
      revision,
      playlistId: input.playlistId,
      playlistTrackIds,
      trackCount,
    }),
  );
}

function playlistTrackCount(database: LibraryTransaction, playlistId: number) {
  return (
    database
      .select({ count: count() })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .get()?.count ?? 0
  );
}

function requirePlaylist(database: LibraryTransaction, playlistId: number) {
  const playlist = database
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) throw new Error("Playlist does not exist");
}

export function requireTracks(database: LibraryTransaction, trackIds: readonly number[]) {
  const uniqueTrackIds = [...new Set(trackIds)];

  const foundCount = parameterChunks(uniqueTrackIds).reduce(
    (total, ids) =>
      total +
      (database.select({ count: count() }).from(tracks).where(inArray(tracks.id, ids)).get()
        ?.count ?? 0),
    0,
  );

  if (foundCount !== uniqueTrackIds.length) throw new Error("Track does not exist");
}

function trackIdsInPlaylist(
  database: LibraryTransaction,
  playlistId: number,
  trackIds: readonly number[],
) {
  return new Set(
    parameterChunks([...new Set(trackIds)]).flatMap((ids) =>
      database
        .selectDistinct({ trackId: playlistTracks.trackId })
        .from(playlistTracks)
        .where(and(eq(playlistTracks.playlistId, playlistId), inArray(playlistTracks.trackId, ids)))
        .all()
        .map((row) => row.trackId),
    ),
  );
}

function appendPlaylistTracks(
  database: LibraryTransaction,
  playlistId: number,
  trackIds: readonly number[],
  now: number,
) {
  if (trackIds.length === 0) return [];

  const basePosition =
    database
      .select({ position: sql<number | null>`MAX(${playlistTracks.position}) + 1` })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .get()?.position ?? 0;

  const rows = trackIds.map((trackId, index) => ({
    createdAt: now,
    playlistId,
    position: basePosition + index,
    trackId,
  }));

  const inserted = parameterChunks(rows, Object.keys(rows[0]).length).flatMap((chunk) =>
    database.insert(playlistTracks).values(chunk).returning(playlistTrackColumns).all(),
  );

  touchPlaylist(database, playlistId, now);

  return inserted.sort((left, right) => left.position - right.position);
}

function touchPlaylist(database: LibraryTransaction, playlistId: number, now: number) {
  database.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId)).run();
}
