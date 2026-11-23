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
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  PLAYLIST_TITLE_MAX_LENGTH,
} from "@shared/playlist-text";
import { getDatabase, parameterChunks, type LibraryTransaction } from "./database";
import { commitLibrary, currentLibraryRevision } from "./library-events";
import { PlaylistTracksTable, PlaylistsTable, TracksTable } from "./database/schema";

const PLAYLIST_COLUMNS = {
  description: PlaylistsTable.description,
  id: PlaylistsTable.id,
  title: PlaylistsTable.title,
};

const PLAYLIST_TRACK_COLUMNS = {
  addedAt: PlaylistTracksTable.createdAt,
  id: PlaylistTracksTable.id,
  position: PlaylistTracksTable.position,
  trackId: PlaylistTracksTable.trackId,
};

export function getPlaylists(): PlaylistSummary[] {
  return getDatabase()
    .select({
      ...PLAYLIST_COLUMNS,
      trackCount: count(PlaylistTracksTable.id),
    })
    .from(PlaylistsTable)
    .leftJoin(PlaylistTracksTable, eq(PlaylistTracksTable.playlistId, PlaylistsTable.id))
    .groupBy(PlaylistsTable.id)
    .orderBy(PlaylistsTable.createdAt, sql`${PlaylistsTable}.rowid`)
    .all();
}

export function getPlaylist(playlistId: number): PlaylistRead {
  const database = getDatabase();

  const playlist = database
    .select(PLAYLIST_COLUMNS)
    .from(PlaylistsTable)
    .where(eq(PlaylistsTable.id, playlistId))
    .get();

  return {
    revision: currentLibraryRevision(),
    playlist: playlist
      ? {
          ...playlist,
          tracks: database
            .select(PLAYLIST_TRACK_COLUMNS)
            .from(PlaylistTracksTable)
            .where(eq(PlaylistTracksTable.playlistId, playlistId))
            .orderBy(PlaylistTracksTable.position)
            .all(),
        }
      : null,
  };
}

export function createPlaylist(input: PlaylistCreationInput): PlaylistDetails {
  const { description, title } = normalizePlaylistText(input);

  if (title.length === 0 || title.length > PLAYLIST_TITLE_MAX_LENGTH) {
    throw new Error(
      `Playlist titles must contain between 1 and ${PLAYLIST_TITLE_MAX_LENGTH} characters`,
    );
  }

  if (description !== null && description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Playlist descriptions cannot exceed ${PLAYLIST_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  return commitLibrary(
    getDatabase(),
    (transaction) => {
      requireTracks(transaction, input.trackIds);

      const now = Date.now();

      const playlist = transaction
        .insert(PlaylistsTable)
        .values({
          createdAt: now,
          description,
          title,
          updatedAt: now,
        })
        .returning(PLAYLIST_COLUMNS)
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
        .delete(PlaylistsTable)
        .where(eq(PlaylistsTable.id, playlistId))
        .returning({ id: PlaylistsTable.id })
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
    and(eq(PlaylistTracksTable.playlistId, input.playlistId), inArray(PlaylistTracksTable.id, ids));

  commitLibrary(
    getDatabase(),
    (transaction) => {
      requirePlaylist(transaction, input.playlistId);

      const ownedCount = chunks.reduce(
        (total, ids) =>
          total +
          (transaction
            .select({ count: count() })
            .from(PlaylistTracksTable)
            .where(inPlaylist(ids))
            .get()?.count ?? 0),
        0,
      );

      if (ownedCount !== playlistTrackIds.length) {
        throw new Error("Playlist track does not exist in this playlist");
      }

      for (const ids of chunks)
        transaction.delete(PlaylistTracksTable).where(inPlaylist(ids)).run();

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
      .from(PlaylistTracksTable)
      .where(eq(PlaylistTracksTable.playlistId, playlistId))
      .get()?.count ?? 0
  );
}

function requirePlaylist(database: LibraryTransaction, playlistId: number) {
  const playlist = database
    .select({ id: PlaylistsTable.id })
    .from(PlaylistsTable)
    .where(eq(PlaylistsTable.id, playlistId))
    .get();

  if (!playlist) throw new Error("Playlist does not exist");
}

export function requireTracks(database: LibraryTransaction, trackIds: readonly number[]) {
  const uniqueTrackIds = [...new Set(trackIds)];

  const foundCount = parameterChunks(uniqueTrackIds).reduce(
    (total, ids) =>
      total +
      (database
        .select({ count: count() })
        .from(TracksTable)
        .where(inArray(TracksTable.id, ids))
        .get()?.count ?? 0),
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
        .selectDistinct({ trackId: PlaylistTracksTable.trackId })
        .from(PlaylistTracksTable)
        .where(
          and(
            eq(PlaylistTracksTable.playlistId, playlistId),
            inArray(PlaylistTracksTable.trackId, ids),
          ),
        )
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
      .select({ position: sql<number | null>`MAX(${PlaylistTracksTable.position}) + 1` })
      .from(PlaylistTracksTable)
      .where(eq(PlaylistTracksTable.playlistId, playlistId))
      .get()?.position ?? 0;

  const rows = trackIds.map((trackId, index) => ({
    createdAt: now,
    playlistId,
    position: basePosition + index,
    trackId,
  }));

  const inserted = parameterChunks(rows, Object.keys(rows[0]).length).flatMap((chunk) =>
    database.insert(PlaylistTracksTable).values(chunk).returning(PLAYLIST_TRACK_COLUMNS).all(),
  );

  touchPlaylist(database, playlistId, now);

  return inserted.sort((left, right) => left.position - right.position);
}

function touchPlaylist(database: LibraryTransaction, playlistId: number, now: number) {
  database
    .update(PlaylistsTable)
    .set({ updatedAt: now })
    .where(eq(PlaylistsTable.id, playlistId))
    .run();
}
