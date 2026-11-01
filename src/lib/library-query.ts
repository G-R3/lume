import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type LibrarySnapshot,
  type LibrarySource,
  type LibraryUpdate,
  parseLibrarySnapshot,
  type SetTracksLikedInput,
  type Track,
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

type LikeWrite = { previousLikedAt: Map<number, number | null> };

// The newest write per track decides what it shows. An older write that settles later, or a
// library reread that replaced the track objects meanwhile, must not override it.
const newestLikeWrites = new WeakMap<QueryClient, Map<number, LikeWrite>>();

export function setTracksLikedMutation(queryClient: QueryClient) {
  const newestWrites = newestLikeWrites.get(queryClient) ?? new Map<number, LikeWrite>();
  newestLikeWrites.set(queryClient, newestWrites);

  const settle = (write: LikeWrite, likedAtOf: (trackId: number) => number | null | undefined) => {
    updateLibraryTracks(queryClient, (track) => {
      const likedAt = newestWrites.get(track.id) === write ? likedAtOf(track.id) : undefined;

      return likedAt === undefined ? track : { ...track, likedAt };
    });

    for (const trackId of write.previousLikedAt.keys()) {
      if (newestWrites.get(trackId) === write) newestWrites.delete(trackId);
    }
  };

  return mutationOptions({
    ...libraryMutationOptions,
    mutationFn: (input: SetTracksLikedInput) => window.lume.setTracksLiked(input),
    onMutate: async (input): Promise<LikeWrite> => {
      await queryClient.cancelQueries({ queryKey: libraryQueryOptions.queryKey });

      const likedAt = input.liked ? Date.now() : null;
      const trackIds = new Set(input.trackIds);
      const write: LikeWrite = { previousLikedAt: new Map() };

      updateLibraryTracks(queryClient, (track) => {
        if (!trackIds.has(track.id)) return track;

        write.previousLikedAt.set(track.id, track.likedAt);
        newestWrites.set(track.id, write);

        return { ...track, likedAt };
      });

      return write;
    },
    onError: (_error, _input, write) => {
      if (write) settle(write, (trackId) => write.previousLikedAt.get(trackId));
      void queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });
    },
    onSuccess: (results, _input, write) => {
      const likedAtById = new Map(results.map((result) => [result.trackId, result.likedAt]));
      settle(write, (trackId) => likedAtById.get(trackId));
    },
  });
}

export function useSetTracksLiked() {
  return useMutation(setTracksLikedMutation(useQueryClient()));
}

function updateLibraryTracks(queryClient: QueryClient, update: (track: Track) => Track) {
  queryClient.setQueryData<LibrarySnapshot>(libraryQueryOptions.queryKey, (library) => {
    if (!library || library.kind === "first-run") return library;

    let changed = false;

    const tracks = library.tracks.map((track) => {
      const next = update(track);
      changed ||= next !== track;

      return next;
    });

    return changed ? { ...library, tracks } : library;
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
