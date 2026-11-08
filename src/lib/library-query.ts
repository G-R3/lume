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
} from "../../shared/lib";
import { z } from "zod";
import {
  type ConfirmedLibrary,
  type ShownLibrary,
  showConfirmedLibrary,
  withLikedAt,
  withNewerLikes,
  withNewerSnapshot,
  withNewerSources,
} from "@/lib/confirmed-library";

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

    return withNewerSnapshot(client.getQueryData<ConfirmedLibrary>(queryKey), snapshot);
  },
  retry: false,
  select: showConfirmedLibrary,
  staleTime: Infinity,
});

const setTracksLikedKey = ["set-tracks-liked"];

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

export function replaceLibrary(queryClient: QueryClient, snapshot: LibrarySnapshot) {
  queryClient.setQueryData(libraryQueryOptions.queryKey, (confirmed) =>
    withNewerSnapshot(confirmed, snapshot),
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

  const confirmed = queryClient.setQueryData(libraryQueryOptions.queryKey, (current) =>
    withNewerSources(current, update),
  );

  if (confirmed?.snapshot?.kind !== "library") {
    void queryClient.invalidateQueries(
      { queryKey: libraryQueryOptions.queryKey },
      { cancelRefetch: false },
    );
  }
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
      parseLibrarySnapshot(await runLibraryCommand(command)),
    onSuccess: (library) => replaceLibrary(queryClient, library),
  });
}

export function useSetTracksLiked() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: setTracksLikedKey,
    networkMode: "always",
    scope: { id: "likes" },
    mutationFn: (input: SetTracksLikedInput) => window.lume.setTracksLiked(input),
    // Runs before the mutation stops being pending, so the stored time replaces the intent with no gap.
    onSuccess: (result) => {
      queryClient.setQueryData(
        libraryQueryOptions.queryKey,
        (confirmed) => confirmed && withNewerLikes(confirmed, result),
      );
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
