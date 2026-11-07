import {
  type Mutation,
  queryOptions,
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type LibrarySnapshot,
  type LibraryUpdate,
  parseLibrarySnapshot,
  type SetTracksLikedInput,
  type TrackLikeResult,
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

// Holds only libraries main sent. Every payload arrives as an invoke reply, and Electron delivers
// replies in the order main computed them, so the last one applied is the newest.
const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: async () => parseLibrarySnapshot(await window.lume.loadLibrary()),
  retry: false,
  staleTime: Infinity,
});

const setTracksLikedKey = ["set-tracks-liked"];

type PendingLike = { input: SetTracksLikedInput; submittedAt: number };

const pendingLikesOptions = {
  filters: { mutationKey: setTracksLikedKey, status: "pending" },
  // SAFETY: only `useSetTracksLiked` uses `setTracksLikedKey`, and a pending mutation has its variables.
  select: (mutation: Mutation): PendingLike => ({
    input: mutation.state.variables as SetTracksLikedInput,
    submittedAt: mutation.state.submittedAt,
  }),
} as const;

/** The library to show: what main confirmed, with each pending like's intent on top. */
export function useLibrary() {
  const queryClient = useQueryClient();
  const query = useQuery(libraryQueryOptions);
  const pendingLikes = useMutationState(pendingLikesOptions);

  useEffect(() => {
    void window.lume.awaitStartupScan().then((update) => {
      if (update) applyStartupScan(queryClient, update);
    });
  }, [queryClient]);

  return {
    error: query.error,
    library: withPendingLikes(query.data, pendingLikes),
    refetch: query.refetch,
  };
}

export function replaceLibrary(queryClient: QueryClient, library: LibrarySnapshot) {
  queryClient.setQueryData(libraryQueryOptions.queryKey, library);
}

export function refreshLibrary(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });
}

function applyStartupScan(queryClient: QueryClient, update: LibraryUpdate) {
  if (update.kind === "snapshot") {
    replaceLibrary(queryClient, parseLibrarySnapshot(update.library));

    return;
  }

  const current = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (current?.kind === "library") {
    replaceLibrary(queryClient, { ...current, sources: update.sources });

    return;
  }

  void refreshLibrary(queryClient);
}

function withPendingLikes(
  library: LibrarySnapshot | undefined,
  pendingLikes: readonly PendingLike[],
): LibrarySnapshot | undefined {
  if (pendingLikes.length === 0 || library?.kind !== "library") return library;

  // Mutation cache order is call order, so the newest intent for a track wins.
  const intents = new Map<number, number | null>();

  for (const { input, submittedAt } of pendingLikes) {
    for (const trackId of input.trackIds) intents.set(trackId, input.liked ? submittedAt : null);
  }

  let changed = false;

  const tracks = library.tracks.map((track) => {
    const intent = intents.get(track.id);

    if (intent === undefined || (intent === null) === (track.likedAt === null)) return track;

    changed = true;

    return { ...track, likedAt: intent };
  });

  return changed ? { ...library, tracks } : library;
}

export function useLibraryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryMutationOptions,
    mutationFn: async (command: LibraryCommand) =>
      parseLibrarySnapshot(await runLibraryCommand(command)),
    onSuccess: (library) => replaceLibrary(queryClient, library),
  });
}

export function useSetTracksLiked() {
  const queryClient = useQueryClient();

  // No library scope: the stored times reach the cache through `confirmLikes`, and a library computed
  // after this write already contains them, so a like need not wait for folder or playlist commands.
  return useMutation({
    mutationKey: setTracksLikedKey,
    networkMode: "always",
    mutationFn: (input: SetTracksLikedInput) => window.lume.setTracksLiked(input),
    // Runs before the mutation stops being pending, so the stored time replaces the intent with no gap.
    onSuccess: (results) => confirmLikes(queryClient, results),
  });
}

function confirmLikes(queryClient: QueryClient, results: readonly TrackLikeResult[]) {
  const library = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (library?.kind !== "library") return;

  const likedAtById = new Map(results.map((result) => [result.trackId, result.likedAt]));
  let changed = false;

  const tracks = library.tracks.map((track) => {
    const likedAt = likedAtById.get(track.id);

    if (likedAt === undefined || likedAt === track.likedAt) return track;

    changed = true;

    return { ...track, likedAt };
  });

  if (changed) replaceLibrary(queryClient, { ...library, tracks });
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
