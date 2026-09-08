import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "delete-playlist"; playlistId: string }
  | { kind: "forget-source"; sourceId: string }
  | { kind: "rescan-source"; sourceId: string }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: string };

export const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: () => window.lume.loadLibrary(),
  retry: false,
  staleTime: Infinity,
});

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
