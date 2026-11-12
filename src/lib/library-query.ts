import {
  type Mutation,
  queryOptions,
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  type LibrarySnapshot,
  type LibraryUpdate,
  parseLibrarySnapshot,
  type SetTracksLikedInput,
} from "../../shared/lib";
import { z } from "zod";
import {
  type SavedLibrary,
  type ShownLibrary,
  showSavedLibrary,
  withLikedAt,
  withNewerLikes,
  withNewerSnapshot,
  withNewerSources,
} from "@/lib/saved-library";

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "forget-source"; sourceId: number }
  | { kind: "rescan-source"; sourceId: number }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: number };

export const libraryCommandOptions = {
  networkMode: "always",
  scope: { id: "library" },
} as const;

const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: async ({ client, queryKey }) => {
    const snapshot = parseLibrarySnapshot(await window.lume.loadLibrary());

    return withNewerSnapshot(client.getQueryData<SavedLibrary>(queryKey), snapshot);
  },
  retry: false,
  select: showSavedLibrary,
  staleTime: Infinity,
});

const setTracksLikedKey = ["set-tracks-liked"];

const likesInClickOrder = { id: "likes" };

type PendingLike = { input: SetTracksLikedInput; submittedAt: number };

const setTracksLikedInputSchema = z.object({
  liked: z.boolean(),
  trackIds: z.array(z.number()),
}) satisfies z.ZodType<SetTracksLikedInput>;

const pendingLikesOptions = {
  filters: { mutationKey: setTracksLikedKey, status: "pending" },
  select: (mutation: Mutation): PendingLike => ({
    input: setTracksLikedInputSchema.parse(mutation.state.variables),
    submittedAt: mutation.state.submittedAt,
  }),
} as const;

export function useLibrary() {
  const queryClient = useQueryClient();
  const query = useQuery(libraryQueryOptions);
  const pendingLikes = useMutationState(pendingLikesOptions);

  const library = useMemo(
    () => withPendingLikes(query.data, pendingLikes),
    [query.data, pendingLikes],
  );

  useEffect(() => {
    void window.lume.awaitStartupScan().then((update) => {
      if (update) applyStartupScan(queryClient, update);
    });
  }, [queryClient]);

  return {
    error: query.error,
    library,
    refetch: query.refetch,
  };
}

export function replaceLibrary(queryClient: QueryClient, snapshot: LibrarySnapshot) {
  queryClient.setQueryData(libraryQueryOptions.queryKey, (saved) =>
    withNewerSnapshot(saved, snapshot),
  );
}

export function refreshLibrary(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });
}

function applyStartupScan(queryClient: QueryClient, update: LibraryUpdate) {
  if (update.kind === "snapshot") {
    replaceLibrary(queryClient, parseLibrarySnapshot(update.library));

    return;
  }

  const saved = queryClient.setQueryData(libraryQueryOptions.queryKey, (current) =>
    withNewerSources(current, update),
  );

  if (!hasLibrary(saved)) void readLibraryAfterScan(queryClient);
}

async function readLibraryAfterScan(queryClient: QueryClient) {
  const filters = { queryKey: libraryQueryOptions.queryKey };
  const joinsEarlierRead = queryClient.isFetching(filters) > 0;

  await queryClient.invalidateQueries(filters, { cancelRefetch: false });

  if (joinsEarlierRead && !hasLibrary(queryClient.getQueryData(filters.queryKey))) {
    await queryClient.invalidateQueries(filters, { cancelRefetch: false });
  }
}

function hasLibrary(saved: SavedLibrary | undefined) {
  return saved?.snapshot?.kind === "library";
}

function withPendingLikes(
  library: ShownLibrary | undefined,
  pendingLikes: readonly PendingLike[],
): ShownLibrary | undefined {
  if (pendingLikes.length === 0 || library?.kind !== "library") return library;

  // Mutation cache order is call order, so the newest intent for a track wins.
  const intents = new Map<number, number | null>();

  for (const { input, submittedAt } of pendingLikes) {
    for (const trackId of input.trackIds) intents.set(trackId, input.liked ? submittedAt : null);
  }

  return withLikedAt(library, (track) => {
    const intent = intents.get(track.id);
    const keepsStoredState = intent === undefined || (intent === null) === (track.likedAt === null);

    return keepsStoredState ? track.likedAt : intent;
  });
}

export function useLibraryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...libraryCommandOptions,
    mutationFn: async (command: LibraryCommand) =>
      parseLibrarySnapshot(await runLibraryCommand(queryClient, command)),
    onError: () => refreshLibrary(queryClient),
    onSuccess: (library) => replaceLibrary(queryClient, library),
  });
}

export function useSetTracksLiked() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: setTracksLikedKey,
    networkMode: "always",
    scope: likesInClickOrder,
    mutationFn: (input: SetTracksLikedInput) => window.lume.setTracksLiked(input),
    // Runs before the mutation stops being pending, so the stored time replaces the intent with no gap.
    onSuccess: (result) => {
      queryClient.setQueryData(
        libraryQueryOptions.queryKey,
        (saved) => saved && withNewerLikes(saved, result),
      );
    },
  });
}

async function runLibraryCommand(queryClient: QueryClient, command: LibraryCommand) {
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
      if (!command.enabled) return window.lume.disableSource(command.sourceId);

      replaceLibrary(
        queryClient,
        parseLibrarySnapshot(await window.lume.enableSource(command.sourceId)),
      );

      return window.lume.rescanSource(command.sourceId);
  }
}
