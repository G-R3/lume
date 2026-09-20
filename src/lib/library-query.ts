import { queryOptions, type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "delete-playlist"; playlistId: number }
  | { kind: "forget-source"; sourceId: number }
  | { kind: "rescan-source"; sourceId: number }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: number };

type PlaylistTrackInput = {
  playlistId: number;
  trackId: number;
};

type PlaylistEntryInput = {
  entryId: number;
  playlistId: number;
};

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

export function playlistQueryOptions(playlistId: number) {
  return queryOptions({
    networkMode: "always",
    queryKey: ["playlist", playlistId],
    queryFn: () => window.lume.loadPlaylist(playlistId),
    retry: false,
  });
}

export function useLibraryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runLibraryCommand,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library) => queryClient.setQueryData(libraryQueryOptions.queryKey, library),
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

  return useMutation({
    ...playlistMutationOptions,
    mutationFn: (input: PlaylistTrackInput) =>
      window.lume.addTrackToPlaylist(input.playlistId, input.trackId),
    onSuccess: (result, input) => {
      if (result.kind === "duplicate") return;

      return invalidatePlaylistQueries(queryClient, input.playlistId);
    },
  });
}

export function useConfirmAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...playlistMutationOptions,
    mutationFn: (input: PlaylistTrackInput) =>
      window.lume.confirmAddTrackToPlaylist(input.playlistId, input.trackId),
    onSuccess: (_entry, input) => invalidatePlaylistQueries(queryClient, input.playlistId),
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

export function useRemovePlaylistEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...playlistMutationOptions,
    mutationFn: (input: PlaylistEntryInput) =>
      window.lume.removePlaylistEntry(input.playlistId, input.entryId),
    onSuccess: (_result, input) => invalidatePlaylistQueries(queryClient, input.playlistId),
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
