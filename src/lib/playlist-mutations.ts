import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  parseLibrarySnapshot,
  type PlaylistCreationInput,
  type PlaylistTrack,
  type PlaylistTrackInput,
  type PlaylistTrackRemovalInput,
} from "../../shared/lib";
import { usePlayback } from "@/hooks/use-playback";
import { libraryMutationOptions, libraryQueryOptions } from "@/lib/library-query";
import { playlistQueryOptions } from "@/lib/playlist-query";

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: async (input: PlaylistCreationInput) => {
      const result = await window.lume.createPlaylist(input);

      return { library: parseLibrarySnapshot(result.library), playlist: result.playlist };
    },
    onSuccess: (result) => queryClient.setQueryData(libraryQueryOptions.queryKey, result.library),
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
      commitPlaylistDeletion(queryClient, playlistId);
      playback.applySourceChange({ type: "sourceDeleted", playlistId });
      queryClient.setQueryData(libraryQueryOptions.queryKey, library);
    },
  });
}

export function useAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: (input: PlaylistTrackInput) => window.lume.addTrackToPlaylist(input),
    onSuccess: (result, input) => {
      if (result.kind === "duplicate") return;

      const canonicalIndex = commitPlaylistAddition(queryClient, input.playlistId, result.track);
      playback.applySourceChange({
        type: "sourceEntryAdded",
        playlistId: input.playlistId,
        entry: { sourceEntryId: result.track.id, trackId: result.track.trackId },
        canonicalIndex,
      });

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

export function useConfirmAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: (input: PlaylistTrackInput) => window.lume.confirmAddTrackToPlaylist(input),
    onSuccess: (track, input) => {
      const canonicalIndex = commitPlaylistAddition(queryClient, input.playlistId, track);
      playback.applySourceChange({
        type: "sourceEntryAdded",
        playlistId: input.playlistId,
        entry: { sourceEntryId: track.id, trackId: track.trackId },
        canonicalIndex,
      });

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

export function useCreatePlaylistFromTrackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: window.lume.createPlaylistFromTrack,
    onSuccess: (playlist) => {
      queryClient.setQueryData(playlistQueryOptions(playlist.id).queryKey, playlist);

      return queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });
    },
  });
}

export function useRemovePlaylistTrackMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: (input: PlaylistTrackRemovalInput) => window.lume.removePlaylistTrack(input),
    onSuccess: (_result, input) => {
      commitPlaylistRemoval(queryClient, input.playlistId, input.playlistTrackId);
      playback.applySourceChange({
        type: "sourceEntryRemoved",
        playlistId: input.playlistId,
        sourceEntryId: input.playlistTrackId,
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
  track: PlaylistTrack,
) {
  const options = playlistQueryOptions(playlistId);
  void queryClient.cancelQueries({ queryKey: options.queryKey });
  const playlist = queryClient.getQueryData(options.queryKey);

  if (!playlist) return undefined;

  const canonicalIndex = playlist.tracks.filter((entry) => entry.position < track.position).length;

  queryClient.setQueryData(options.queryKey, () => ({
    ...playlist,
    tracks: [...playlist.tracks.filter((entry) => entry.id !== track.id), track].sort(
      (left, right) => left.position - right.position,
    ),
  }));

  return canonicalIndex;
}

function commitPlaylistRemoval(
  queryClient: QueryClient,
  playlistId: number,
  playlistTrackId: number,
) {
  const options = playlistQueryOptions(playlistId);
  void queryClient.cancelQueries({ queryKey: options.queryKey });

  queryClient.setQueryData(
    options.queryKey,
    (playlist) =>
      playlist && {
        ...playlist,
        tracks: playlist.tracks.filter((track) => track.id !== playlistTrackId),
      },
  );
}

function commitPlaylistDeletion(queryClient: QueryClient, playlistId: number) {
  const options = playlistQueryOptions(playlistId);
  void queryClient.cancelQueries({ queryKey: options.queryKey });
  queryClient.setQueryData(options.queryKey, null);
}
