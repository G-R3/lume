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
  type FirstRunLibrary,
  type LibraryRevision,
  type LibrarySnapshot,
  type LibraryUpdate,
  type MusicLibrary,
  parseLibrarySnapshot,
  type SetTracksLikedInput,
  type Track,
  type TracksLikedResult,
} from "../../shared/lib";
import { z } from "zod";

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

type ConfirmedLibrary = {
  likes: ReadonlyMap<Track["id"], ConfirmedLike>;
  snapshot: LibrarySnapshot;
  sources: RevisedSources | null;
};

type RevisedSources = { revision: LibraryRevision; sources: MusicLibrary["sources"] };

type ConfirmedLike = { likedAt: Track["likedAt"]; revision: LibraryRevision };

type ShownLibrary = MusicLibrary | FirstRunLibrary;

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

  const confirmed = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (confirmed?.snapshot.kind === "library") {
    queryClient.setQueryData(libraryQueryOptions.queryKey, withNewerSources(confirmed, update));

    return;
  }

  void refreshLibrary(queryClient);
}

function withNewerSnapshot(
  confirmed: ConfirmedLibrary | undefined,
  snapshot: LibrarySnapshot,
): ConfirmedLibrary {
  if (confirmed && snapshot.revision <= confirmed.snapshot.revision) return confirmed;

  const isNewerThanSnapshot = (part: { revision: LibraryRevision }) =>
    part.revision > snapshot.revision;

  return {
    likes: new Map([...(confirmed?.likes ?? [])].filter(([, like]) => isNewerThanSnapshot(like))),
    snapshot,
    sources:
      confirmed?.sources && isNewerThanSnapshot(confirmed.sources) ? confirmed.sources : null,
  };
}

function withNewerSources(confirmed: ConfirmedLibrary, update: RevisedSources): ConfirmedLibrary {
  const newestSources = confirmed.sources ?? confirmed.snapshot;

  return update.revision > newestSources.revision ? { ...confirmed, sources: update } : confirmed;
}

function withNewerLikes(confirmed: ConfirmedLibrary, result: TracksLikedResult): ConfirmedLibrary {
  const likes = new Map(confirmed.likes);
  let changed = false;

  for (const { likedAt, trackId } of result.likes) {
    const newestLike = likes.get(trackId) ?? confirmed.snapshot;

    if (result.revision <= newestLike.revision) continue;

    likes.set(trackId, { likedAt, revision: result.revision });
    changed = true;
  }

  return changed ? { ...confirmed, likes } : confirmed;
}

function showConfirmedLibrary({ likes, snapshot, sources }: ConfirmedLibrary): ShownLibrary {
  if (snapshot.kind === "first-run") return snapshot;

  const library = sources ? { ...snapshot, sources: sources.sources } : snapshot;

  if (likes.size === 0) return library;

  return withLikedAt(library, (track) => {
    const like = likes.get(track.id);

    return like ? like.likedAt : track.likedAt;
  });
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

function withLikedAt(
  library: MusicLibrary,
  likedAtOf: (track: Track) => Track["likedAt"],
): MusicLibrary {
  let changed = false;

  const tracks = library.tracks.map((track) => {
    const likedAt = likedAtOf(track);

    if (likedAt === track.likedAt) return track;

    changed = true;

    return { ...track, likedAt };
  });

  return changed ? { ...library, tracks } : library;
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
    // Main commits likes in call order only if each starts after the previous one is saved.
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
