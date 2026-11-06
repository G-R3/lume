import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type LibrarySnapshot,
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

const setTracksLikedKey = ["library", "set-tracks-liked"];

export const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: async () => parseLibrarySnapshot(await window.lume.loadLibrary()),
  retry: false,
  staleTime: Infinity,
});

// Main builds every library payload synchronously and Electron delivers replies and pushes in send
// order, so whichever payload arrives last is the newest. A push that lands during a read is older
// than that read's result, so the read may replace it.
export function applyLibraryUpdate(queryClient: QueryClient, update: LibraryUpdate) {
  if (update.kind === "snapshot") {
    queryClient.setQueryData(libraryQueryOptions.queryKey, parseLibrarySnapshot(update.library));

    return;
  }

  const current = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (current?.kind === "library") {
    // Pass a function: TanStack's `setQueryData` rejects the narrowed `MusicLibrary` as a plain value.
    queryClient.setQueryData(libraryQueryOptions.queryKey, () => ({
      ...current,
      sources: update.sources,
    }));

    return;
  }

  void queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey }, { cancelRefetch: false });
}

export function useLibraryQuery() {
  const query = useQuery(libraryQueryOptions);

  const pendingLikes = useMutationState({
    filters: { mutationKey: setTracksLikedKey, status: "pending" },
    // SAFETY: only `setTracksLikedMutation` uses `setTracksLikedKey`.
    select: (mutation) => ({
      input: mutation.state.variables as SetTracksLikedInput,
      submittedAt: mutation.state.submittedAt,
    }),
  });

  return {
    error: query.error,
    library: query.data && withPendingLikes(query.data, pendingLikes),
    refetch: query.refetch,
  };
}

type PendingLike = { input: SetTracksLikedInput; submittedAt: number };

// The cache holds only what main stored. Pending writes show over it, newest last, so neither a
// snapshot nor an older write's result can hide a like the user has not seen settle.
function withPendingLikes(library: LibrarySnapshot, pendingLikes: readonly PendingLike[]) {
  if (library.kind === "first-run" || pendingLikes.length === 0) return library;

  const likedAtById = new Map<number, number | null>();

  for (const { input, submittedAt } of pendingLikes) {
    for (const trackId of input.trackIds) likedAtById.set(trackId, input.liked ? submittedAt : null);
  }

  return {
    ...library,
    tracks: library.tracks.map((track) => {
      const likedAt = likedAtById.get(track.id);

      return likedAt === undefined || likedAt === track.likedAt ? track : { ...track, likedAt };
    }),
  };
}

export function libraryCommandMutation(queryClient: QueryClient) {
  return mutationOptions({
    ...libraryMutationOptions,
    mutationFn: async (command: LibraryCommand) =>
      parseLibrarySnapshot(await runLibraryCommand(command)),
    onSuccess: (library) => queryClient.setQueryData(libraryQueryOptions.queryKey, library),
  });
}

export function useLibraryMutation() {
  return useMutation(libraryCommandMutation(useQueryClient()));
}

export function setTracksLikedMutation(queryClient: QueryClient) {
  return mutationOptions({
    ...libraryMutationOptions,
    mutationKey: setTracksLikedKey,
    mutationFn: (input: SetTracksLikedInput) => window.lume.setTracksLiked(input),
    onError: () => queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey }),
    onSuccess: (results) => {
      const likedAtById = new Map(results.map((result) => [result.trackId, result.likedAt]));

      updateLibraryTracks(queryClient, (track) => {
        const likedAt = likedAtById.get(track.id);

        return likedAt === undefined ? track : { ...track, likedAt };
      });
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
