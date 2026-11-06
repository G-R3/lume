import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AddTracksToPlaylistInput,
  parseLibrarySnapshot,
  type PlaylistCreationInput,
  type PlaylistTrack,
  type RemovePlaylistTracksInput,
} from "../../shared/lib";
import { usePlayback } from "@/hooks/use-playback";
import { libraryMutationOptions, libraryQueryOptions } from "@/lib/library-query";
import { playlistQueryOptions } from "@/lib/playlist-query";
import { forgetViewSort } from "@/lib/view-sort";

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: async (input: PlaylistCreationInput) => {
      const result = await window.lume.createPlaylist(input);

      return { library: parseLibrarySnapshot(result.library), playlist: result.playlist };
    },
    onSuccess: (result) => {
      forgetViewSort({ kind: "playlist", playlistId: result.playlist.id });
      queryClient.setQueryData(playlistQueryOptions(result.playlist.id).queryKey, result.playlist);
      queryClient.setQueryData(libraryQueryOptions.queryKey, result.library);
    },
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: async (playlistId: number) =>
      parseLibrarySnapshot(await window.lume.deletePlaylist(playlistId)),
    onSuccess: (library, playlistId) => {
      forgetViewSort({ kind: "playlist", playlistId });
      commitPlaylistDeletion(queryClient, playlistId);
      playback.applySourceChange({ type: "sourceDeleted", playlistId });
      queryClient.setQueryData(libraryQueryOptions.queryKey, library);
    },
  });
}

export function useAddTracksToPlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: (input: AddTracksToPlaylistInput) => window.lume.addTracksToPlaylist(input),
    onSuccess: (result, input) => {
      if (result.kind === "duplicate" || result.tracks.length === 0) return;

      commitPlaylistAddition(queryClient, input.playlistId, result.tracks);
      playback.applySourceChange({
        type: "sourceEntriesAdded",
        playlistId: input.playlistId,
        entries: result.tracks.map((track) => ({
          sourceEntryId: track.id,
          trackId: track.trackId,
        })),
      });

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

export function useRemovePlaylistTracksMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: (input: RemovePlaylistTracksInput) => window.lume.removePlaylistTracks(input),
    onSuccess: (_result, input) => {
      commitPlaylistRemoval(queryClient, input.playlistId, input.playlistTrackIds);
      playback.applySourceChange({
        type: "sourceEntriesRemoved",
        playlistId: input.playlistId,
        sourceEntryIds: input.playlistTrackIds,
      });

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

function invalidatePlaylistQueries(queryClient: QueryClient, playlistId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey }),
    queryClient.invalidateQueries({ queryKey: playlistQueryOptions(playlistId).queryKey }),
  ]);
}

function commitPlaylistAddition(
  queryClient: QueryClient,
  playlistId: number,
  tracks: readonly PlaylistTrack[],
) {
  const options = playlistQueryOptions(playlistId);
  const playlist = queryClient.getQueryData(options.queryKey);

  if (!playlist) return;

  const addedIds = new Set(tracks.map((track) => track.id));

  queryClient.setQueryData(options.queryKey, () => ({
    ...playlist,
    tracks: [...playlist.tracks.filter((entry) => !addedIds.has(entry.id)), ...tracks].sort(
      (left, right) => left.position - right.position,
    ),
  }));
}

function commitPlaylistRemoval(
  queryClient: QueryClient,
  playlistId: number,
  playlistTrackIds: readonly number[],
) {
  const options = playlistQueryOptions(playlistId);
  const removedIds = new Set(playlistTrackIds);

  queryClient.setQueryData(
    options.queryKey,
    (playlist) =>
      playlist && {
        ...playlist,
        tracks: playlist.tracks.filter((track) => !removedIds.has(track.id)),
      },
  );
}

function commitPlaylistDeletion(queryClient: QueryClient, playlistId: number) {
  const options = playlistQueryOptions(playlistId);
  queryClient.setQueryData(options.queryKey, null);
}
