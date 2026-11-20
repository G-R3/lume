import {
  type Mutation,
  notifyManager,
  queryOptions,
  type QueryClient,
  skipToken,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  type FirstRunLibrary,
  type LibraryRevision,
  type LibrarySnapshot,
  type MusicLibrary,
  type PlaylistEvent,
  type ScanFrame,
  type SetTracksLikedInput,
  type TrackLikeResult,
} from "@shared/library";
import { parseLibrarySnapshot } from "@shared/library-json";
import { setTracksLikedInputSchema } from "@shared/schemas";
import { type ScanFrames, receiveScanFrame, settleScanFrames } from "@/lib/scan-frames";
import { withLikedAt } from "@/lib/liked-at";
import { playlistEffects, type PlaylistSourceChange } from "@/lib/playlist-events";
import { applyPlaylistRead } from "@/lib/playlist-query";

export type ShownLibrary = MusicLibrary | FirstRunLibrary;

type ApplySourceChange = (change: PlaylistSourceChange, revision: LibraryRevision) => void;

type LibraryCommand =
  | { kind: "add-source" }
  | { kind: "forget-source"; sourceId: number }
  | { kind: "rescan-source"; sourceId: number }
  | { kind: "rescan-sources" }
  | { enabled: boolean; kind: "set-source-enabled"; sourceId: number };

const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: async ({ client, queryKey }) => {
    const snapshot = parseLibrarySnapshot(await window.lume.loadLibrary());
    applyScanFrame(client, snapshot.scans);

    return newerSnapshot(client.getQueryData<LibrarySnapshot>(queryKey), snapshot);
  },
  retry: false,
  staleTime: Infinity,
});

const noScans: ScanFrame = { afterRevision: 0, scanning: [], sequence: 0 };

const noScanFrames: ScanFrames = { shown: noScans, waiting: [] };

const scanFramesKey = ["library-scans"];

const firstRetryDelay = 250;

const lastRetryDelay = 30_000;

const setTracksLikedKey = ["set-tracks-liked"];

const likesInClickOrder = { id: "likes" };

type PendingLike = { input: SetTracksLikedInput; submittedAt: number };

const pendingLikesOptions = {
  filters: { mutationKey: setTracksLikedKey, status: "pending" },
  select: (mutation: Mutation): PendingLike => ({
    input: setTracksLikedInputSchema.parse(mutation.state.variables),
    submittedAt: mutation.state.submittedAt,
  }),
} as const;

export function useLibrary(applySourceChange: ApplySourceChange) {
  const queryClient = useQueryClient();
  const query = useQuery(libraryQueryOptions);
  const pendingLikes = useMutationState(pendingLikesOptions);

  const library = useMemo(
    () => withPendingLikes(query.data, pendingLikes),
    [query.data, pendingLikes],
  );

  useEffect(() => followLibrary(queryClient, applySourceChange), [queryClient, applySourceChange]);

  return {
    error: query.error,
    library,
    refetch: query.refetch,
  };
}

export function useScanningSources(): ReadonlySet<number> {
  const frames =
    useQuery<ScanFrames>({ queryFn: skipToken, queryKey: scanFramesKey, staleTime: Infinity })
      .data ?? noScanFrames;

  const revision = useQuery({ ...libraryQueryOptions, select: (library) => library.revision })
    .data;

  const scanning = settleScanFrames(frames, revision ?? -1).shown.scanning;

  return useMemo(() => new Set(scanning), [scanning]);
}

export async function reachLibraryRevision(queryClient: QueryClient, revision: LibraryRevision) {
  let lastRead: LibraryRevision | null = null;

  while (libraryRevisionOf(queryClient) < revision) {
    // TanStack joins a read that is already running instead of starting another.
    const read = await queryClient.fetchQuery({ ...libraryQueryOptions, staleTime: 0 });

    if (read.revision === lastRead) {
      throw new Error(`The library stayed at revision ${read.revision}, not ${revision}`);
    }

    lastRead = read.revision;
  }
}

export function waitUntilLibraryRevisionShown(queryClient: QueryClient, revision: LibraryRevision) {
  return new Promise<void>((resolve) => {
    const resolveAfterObservers = () => notifyManager.schedule(resolve);

    if (libraryRevisionOf(queryClient) >= revision) {
      resolveAfterObservers();

      return;
    }

    const stop = queryClient.getQueryCache().subscribe(() => {
      if (libraryRevisionOf(queryClient) < revision) return;

      stop();
      resolveAfterObservers();
    });
  });
}

function followLibrary(queryClient: QueryClient, applySourceChange: ApplySourceChange) {
  let following = true;

  const keepTrying = async (task: () => Promise<void>) => {
    for (let delay = firstRetryDelay; following; delay = Math.min(delay * 2, lastRetryDelay)) {
      try {
        return await task();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const follow = (revision: LibraryRevision) =>
    void keepTrying(() => reachLibraryRevision(queryClient, revision));

  const stopListening = window.lume.onLibraryEvent((event) => {
    switch (event.kind) {
      case "changed":
        follow(event.revision);

        return;
      case "tracks-liked":
        applyCommittedLikes(queryClient, event.revision, event.likes);
        follow(event.revision);

        return;
      case "playlist-created":
      case "playlist-deleted":
      case "playlist-tracks-added":
      case "playlist-tracks-removed":
        applyPlaylistEvent(queryClient, applySourceChange, event);
        follow(event.revision);

        return;
      case "scans":
        applyScanFrame(queryClient, event.scans);
    }
  });

  void keepTrying(async () => {
    const state = await window.lume.loadLibraryState();

    if (!following) return;

    applyScanFrame(queryClient, state.scans);
    follow(state.revision);
  });

  return () => {
    following = false;
    stopListening();
  };
}

function applyScanFrame(queryClient: QueryClient, frame: ScanFrame) {
  queryClient.setQueryData<ScanFrames>(scanFramesKey, (frames) =>
    receiveScanFrame(frames ?? noScanFrames, frame, libraryRevisionOf(queryClient)),
  );
}

function applyPlaylistEvent(
  queryClient: QueryClient,
  applySourceChange: ApplySourceChange,
  event: PlaylistEvent,
) {
  const effects = playlistEffects(event);

  patchContiguousLibrary(queryClient, event.revision, (library) => ({
    playlists: effects.summaries(library.playlists),
  }));
  applyPlaylistRead(queryClient, effects);

  if (effects.sourceChange) applySourceChange(effects.sourceChange, event.revision);
}

function applyCommittedLikes(
  queryClient: QueryClient,
  revision: LibraryRevision,
  likes: readonly TrackLikeResult[],
) {
  const likedAt = new Map(likes.map((like) => [like.trackId, like.likedAt]));

  patchContiguousLibrary(queryClient, revision, (library) =>
    withLikedAt(library, (track) =>
      likedAt.has(track.id) ? (likedAt.get(track.id) ?? null) : track.likedAt,
    ),
  );
}

function patchContiguousLibrary(
  queryClient: QueryClient,
  revision: LibraryRevision,
  patch: (library: MusicLibrary) => Partial<MusicLibrary>,
) {
  const saved = queryClient.getQueryData(libraryQueryOptions.queryKey);

  if (saved?.kind !== "library" || saved.revision !== revision - 1) return;

  const patched: LibrarySnapshot = { ...saved, ...patch(saved), revision };
  queryClient.setQueryData(libraryQueryOptions.queryKey, patched);
}

function libraryRevisionOf(queryClient: QueryClient) {
  return queryClient.getQueryData(libraryQueryOptions.queryKey)?.revision ?? -1;
}

function newerSnapshot(saved: LibrarySnapshot | undefined, snapshot: LibrarySnapshot) {
  return saved && saved.revision >= snapshot.revision ? saved : snapshot;
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
    networkMode: "always",
    mutationFn: async (command: LibraryCommand) =>
      reachLibraryRevision(queryClient, await runLibraryCommand(command)),
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
      applyCommittedLikes(queryClient, result.revision, result.likes);

      return reachLibraryRevision(queryClient, result.revision);
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
