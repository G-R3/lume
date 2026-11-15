import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AddTracksToPlaylistInput,
  type PlaylistCreationInput,
  type PlaylistTrack,
  type RemovePlaylistTracksInput,
} from "../../shared/lib";
import { usePlayback } from "@/hooks/use-playback";
import { reachLibraryRevision } from "@/lib/library-query";
import { playlistQueryOptions } from "@/lib/playlist-query";
import { forgetViewSort } from "@/lib/view-sort";

const playlistEditsInOrder = { networkMode: "always", scope: { id: "playlist-edits" } } as const;

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...playlistEditsInOrder,
    mutationFn: async (input: PlaylistCreationInput) => {
      const { playlist, revision } = await window.lume.createPlaylist(input);
      await reachLibraryRevision(queryClient, revision);

      return { playlist };
    },
    onSuccess: ({ playlist }) => {
      forgetViewSort({ kind: "playlist", playlistId: playlist.id });
      queryClient.setQueryData(playlistQueryOptions(playlist.id).queryKey, playlist);
    },
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...playlistEditsInOrder,
    mutationFn: async (playlistId: number) =>
      reachLibraryRevision(queryClient, await window.lume.deletePlaylist(playlistId)),
    onSuccess: (_result, playlistId) => {
      forgetViewSort({ kind: "playlist", playlistId });
      commitPlaylistDeletion(queryClient, playlistId);
      playback.applySourceChange({ type: "sourceDeleted", playlistId });
    },
  });
}

export function useAddTracksToPlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...playlistEditsInOrder,
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

      return invalidatePlaylistQuery(queryClient, input.playlistId);
    },
  });
}

export function useRemovePlaylistTracksMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...playlistEditsInOrder,
    mutationFn: (input: RemovePlaylistTracksInput) => window.lume.removePlaylistTracks(input),
    onSuccess: (_result, input) => {
      commitPlaylistRemoval(queryClient, input.playlistId, input.playlistTrackIds);
      playback.applySourceChange({
        type: "sourceEntriesRemoved",
        playlistId: input.playlistId,
        sourceEntryIds: input.playlistTrackIds,
      });

      return invalidatePlaylistQuery(queryClient, input.playlistId);
    },
  });
}

function invalidatePlaylistQuery(queryClient: QueryClient, playlistId: number) {
  return queryClient.invalidateQueries({ queryKey: playlistQueryOptions(playlistId).queryKey });
}

function commitPlaylistAddition(
  queryClient: QueryClient,
  playlistId: number,
  tracks: readonly PlaylistTrack[],
) {
  const options = playlistQueryOptions(playlistId);
  void queryClient.cancelQueries({ queryKey: options.queryKey });
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
  void queryClient.cancelQueries({ queryKey: options.queryKey });
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
  void queryClient.cancelQueries({ queryKey: options.queryKey });
  queryClient.setQueryData(options.queryKey, null);
}
