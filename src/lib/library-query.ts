import { queryOptions, type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type LibrarySnapshot,
  type LibrarySource,
  type LibraryUpdate,
  parseLibrarySnapshot,
  type TrackLikeInput,
} from "../../shared/lib";

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "forget-source"; sourceId: number }
  | { kind: "rescan-source"; sourceId: number }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: number };

export const libraryMutationOptions = {
  networkMode: "always",
  scope: { id: "library" },
} as const;

const libraryQueryKey = ["library"];

type FirstLoad = { sources?: LibrarySource[] };

const firstLoads = new WeakMap<QueryClient, FirstLoad>();

export const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: libraryQueryKey,
  queryFn: async ({ client }) => {
    if (client.getQueryData(libraryQueryKey) !== undefined) return loadLibrary();

    const firstLoad: FirstLoad = {};
    firstLoads.set(client, firstLoad);

    try {
      const library = await loadLibrary();

      if (!firstLoad.sources || library.kind !== "library") return library;

      return { ...library, sources: firstLoad.sources };
    } finally {
      firstLoads.delete(client);
    }
  },
  retry: false,
  staleTime: Infinity,
});

async function loadLibrary() {
  return parseLibrarySnapshot(await window.lume.loadLibrary());
}

export function applyLibraryUpdate(queryClient: QueryClient, update: LibraryUpdate) {
  if (update.kind === "snapshot") {
    queryClient.setQueryData(libraryQueryOptions.queryKey, parseLibrarySnapshot(update.library));

    return;
  }

  const firstLoad = firstLoads.get(queryClient);

  if (firstLoad) firstLoad.sources = update.sources;

  const current = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (current?.kind === "library") {
    // Pass a function: TanStack's `setQueryData` rejects the narrowed `MusicLibrary` as a plain value.
    queryClient.setQueryData(libraryQueryOptions.queryKey, () => ({
      ...current,
      sources: update.sources,
    }));

    return;
  }

  if (!firstLoad) {
    void queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });
  }
}

export function useLibraryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: async (command: LibraryCommand) =>
      parseLibrarySnapshot(await runLibraryCommand(command)),
    onSuccess: (library) => queryClient.setQueryData(libraryQueryOptions.queryKey, library),
  });
}

export function useSetTrackLiked() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: window.lume.setTrackLiked,
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
}
