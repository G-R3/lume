import { queryOptions, type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LibrarySnapshot,
  PlaylistTrack,
  PlaylistTrackInput,
  PlaylistTrackRemovalInput,
  TrackLikeInput,
} from "../../shared/lib";
import { playlistQueryOptions } from "@/lib/playback-source";

export { playlistQueryOptions } from "@/lib/playback-source";

import { usePlayback } from "@/hooks/use-playback";

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "delete-playlist"; playlistId: number }
  | { kind: "forget-source"; sourceId: number }
  | { kind: "rescan-source"; sourceId: number }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: number };

const playlistMutationOptions = {
  networkMode: "always",
  scope: { id: "library" },
} as const;

export const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: () => window.lume.loadLibrary(),
  retry: false,
  staleTime: Infinity,
});

export function useLibraryMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    mutationFn: runLibraryCommand,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library, command) => {
      if (command.kind === "delete-playlist") {
        const options = playlistQueryOptions(command.playlistId);
        void queryClient.cancelQueries({ queryKey: options.queryKey });
        queryClient.setQueryData(options.queryKey, null);
        playback.applySourceChange({ type: "sourceDeleted", playlistId: command.playlistId });
      }

      queryClient.setQueryData(libraryQueryOptions.queryKey, library);
    },
  });
}

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: window.lume.createPlaylist,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (result) => queryClient.setQueryData(libraryQueryOptions.queryKey, result.library),
  });
}

export function useAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();
  const playback = usePlayback();

  return useMutation({
    ...playlistMutationOptions,
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
    ...playlistMutationOptions,
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
    ...playlistMutationOptions,
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
    ...playlistMutationOptions,
    mutationFn: (input: PlaylistTrackRemovalInput) => window.lume.removePlaylistTrack(input),
    onSuccess: (_result, input) => {
      const options = playlistQueryOptions(input.playlistId);

      void queryClient.cancelQueries({ queryKey: options.queryKey });

      queryClient.setQueryData(
        options.queryKey,
        (playlist) =>
          playlist && {
            ...playlist,
            tracks: playlist.tracks.filter((track) => track.id !== input.playlistTrackId),
          },
      );

      playback.applySourceChange({
        type: "sourceEntryRemoved",
        playlistId: input.playlistId,
        sourceEntryId: input.playlistTrackId,
      });

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

export function useSetTrackLiked() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: window.lume.setTrackLiked,
    networkMode: "always",
    scope: { id: "library" },
    onMutate: async (input: TrackLikeInput) => {
      await queryClient.cancelQueries({ queryKey: libraryQueryOptions.queryKey });

      const previousLibrary = queryClient.getQueryData<LibrarySnapshot>(
        libraryQueryOptions.queryKey,
      );

      queryClient.setQueryData<LibrarySnapshot>(libraryQueryOptions.queryKey, (library) => {
        if (!library || library.kind === "first-run") return library;

        return {
          ...library,
          tracks: library.tracks.map((track) =>
            track.id === input.trackId
              ? { ...track, likedAt: input.liked ? Date.now() : null }
              : track,
          ),
        };
      });

      return { previousLibrary };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(libraryQueryOptions.queryKey, context?.previousLibrary);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LibrarySnapshot>(libraryQueryOptions.queryKey, (library) => {
        if (!library || library.kind === "first-run") return library;

        return {
          ...library,
          tracks: library.tracks.map((track) =>
            track.id === result.trackId ? { ...track, likedAt: result.likedAt } : track,
          ),
        };
      });
    },
  });
}

function runLibraryCommand(command: LibraryCommand) {
  switch (command.kind) {
    case "add-source":
      return window.lume.addSource();
    case "delete-playlist":
      return window.lume.deletePlaylist(command.playlistId);
    case "forget-source":
      return window.lume.forgetSource(command.sourceId);
    case "rescan-source":
      return window.lume.rescanSource(command.sourceId);
    case "rescan-sources":
      return window.lume.rescanSources();
    case "set-source-enabled":
      return command.enabled
        ? window.lume.enableSource(command.sourceId)
        : window.lume.disableSource(command.sourceId);
  }

  command satisfies never;
}

function invalidatePlaylistQueries(queryClient: QueryClient, playlistId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey }),
    queryClient.invalidateQueries({ queryKey: playlistQueryOptions(playlistId).queryKey }),
  ]);
}

/** cancel old reads before adding the committed occurrence to cached canonical data. */
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
