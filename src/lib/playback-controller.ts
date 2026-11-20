import type { LibraryRevision, MusicLibrary, PlaylistRead, Track } from "@shared/library";
import type { LumeApi, SavedPlaybackSession } from "@shared/ipc";
import { createCoalescingWriter } from "@/lib/coalescing-writer";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";
import { shuffleEntries } from "@/lib/fisher-yates";
import type { QueueCommand, QueuePosition, QueueRandom, SessionSource } from "@/lib/queue/commands";
import type { QueueState } from "@/lib/queue/model";
import { parseQueueSession, serializeQueueSession } from "@/lib/queue/persistence";
import { selectCurrentItem, selectPlaybackIntent } from "@/lib/queue/selectors";
import { selectsWithinShuffledSession } from "@/lib/queue/shuffle";
import { libraryEntries, playlistEntries } from "@/lib/queue/source";
import type { FailedTrack } from "@/lib/playback-phase";
import { defaultSort, type TrackSort } from "@/lib/track-sort";
import { transition } from "@/lib/queue/transition";

type Snapshot = {
  queue: QueueState | null;
  library: MusicLibrary | null;
  tracksById: ReadonlyMap<number, Track>;
  availableTrackIds: ReadonlySet<number>;
  isInitialized: boolean;
  failures: PlaybackFailures;
};

export type PlaybackFailures = {
  track: FailedTrack | null;
  save: boolean;
  restore: boolean;
  sourceReload: boolean;
};

export const noFailures: PlaybackFailures = {
  track: null,
  save: false,
  restore: false,
  sourceReload: false,
};

type SourceChange = Extract<
  QueueCommand,
  {
    type: "sourceEntriesAdded" | "sourceEntriesRemoved" | "sourceEntryMoved" | "sourceDeleted";
  }
>;

type PlaylistRestart = { playlistId: number; coveredRevision: LibraryRevision };

type Load = { kind: "unloaded" } | { kind: "loaded"; requestId: string };

type Ready = { kind: "ready"; load: Load };

type Lifecycle = "awaiting-library" | "restoring" | Ready | "closed";

const unloaded: Load = { kind: "unloaded" };

const isReady = (lifecycle: Lifecycle): lifecycle is Ready =>
  lifecycle !== "awaiting-library" && lifecycle !== "restoring" && lifecycle !== "closed";

type SavedSession = { state: QueueState; position: number };

type SessionRequest = Pick<
  Extract<QueueCommand, { type: "startSession" }>,
  "start" | "shuffled" | "paused"
>;

function createQueueRandom(random: () => number): QueueRandom {
  return {
    shuffle: (entries) => shuffleEntries(entries, random),
    index: (count) => Math.floor(random() * count),
  };
}

function readSavedSession(
  raw: SavedPlaybackSession | null,
  library: MusicLibrary,
): ReturnType<typeof parseQueueSession> | "unreadable" {
  try {
    return parseQueueSession(raw, library);
  } catch (error) {
    console.error("Could not parse the saved playback session", error);

    return "unreadable";
  }
}

function savedPosition(position: number) {
  return Number.isFinite(position) ? Math.max(0, position) : 0;
}

export function createPlaybackController(dependencies: {
  audio: {
    load: (request: PlaybackRequest | null, position?: number) => void;
    readLivePosition: () => number;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
  };
  storage: LumeApi["playbackSession"];
  playlistReader: {
    read: (playlistId: number) => Promise<PlaylistRead>;
  };
  hasTrackFile: (trackId: number) => Promise<boolean>;
  random: () => number;
}) {
  const listeners = new Set<() => void>();
  const random = createQueueRandom(dependencies.random);

  let snapshot: Snapshot = {
    queue: null,
    library: null,
    tracksById: new Map(),
    availableTrackIds: new Set(),
    isInitialized: false,
    failures: noFailures,
  };

  let lifecycle: Lifecycle = "awaiting-library";
  let playlistRestart: PlaylistRestart | null = null;
  // Chromium keeps reusing a failed load for the same URL, so these tracks reload under a fresh one.
  const failedTrackIds = new Set<number>();

  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const setFailure = <Slot extends keyof PlaybackFailures>(
    slot: Slot,
    value: PlaybackFailures[Slot],
  ) => {
    if (lifecycle === "closed" || snapshot.failures[slot] === value) return;
    publish({ ...snapshot, failures: { ...snapshot.failures, [slot]: value } });
  };

  const sessionWriter = createCoalescingWriter<SavedSession>({
    write: (next, stored) =>
      next.state === stored?.state
        ? dependencies.storage.savePosition(next.position)
        : dependencies.storage.save({
            payload: serializeQueueSession(next.state),
            position: next.position,
          }),
    // Electron handles sent saves before the final synchronous flush from this renderer.
    writeFinal: (final) =>
      dependencies.storage.flush({
        payload: serializeQueueSession(final.state),
        position: final.position,
      }),
    onResult: (result) => setFailure("save", result === "failed"),
  });

  const persist = (state: QueueState, position: number) =>
    sessionWriter.write({ state, position: savedPosition(position) });

  const needsLoad = () => isReady(lifecycle) && lifecycle.load.kind === "unloaded";

  const loadCurrent = (
    position: number,
    shouldPlay = selectPlaybackIntent(snapshot.queue) === "playing",
  ) => {
    if (!isReady(lifecycle)) return;
    const current = selectCurrentItem(snapshot.queue);
    const track = current ? snapshot.tracksById.get(current.trackId) : undefined;
    const requestId = current && track?.available ? crypto.randomUUID() : null;

    lifecycle = { kind: "ready", load: requestId ? { kind: "loaded", requestId } : unloaded };

    dependencies.audio.load(
      requestId && current && track
        ? {
            requestId,
            queueItemId: current.queueItemId,
            url: failedTrackIds.has(track.id) ? `${track.url}?retry=${requestId}` : track.url,
            shouldPlay,
            position,
            durationHint: track.duration && Number.isFinite(track.duration) ? track.duration : 0,
          }
        : null,
      position,
    );
  };

  const commit = (
    queue: QueueState | null,
    { restartAudio = false, keepFailures = false } = {},
  ) => {
    const previous = snapshot.queue;

    if (!queue || queue === previous || lifecycle === "closed") return;

    const load =
      restartAudio ||
      selectCurrentItem(queue)?.queueItemId !== selectCurrentItem(previous)?.queueItemId;

    publish({
      ...snapshot,
      queue,
      failures:
        load && !keepFailures
          ? { ...snapshot.failures, track: null, restore: false, sourceReload: false }
          : snapshot.failures,
    });
    persist(queue, load ? 0 : dependencies.audio.readLivePosition());

    if (load) loadCurrent(0);
  };

  const dispatch = (
    command: QueueCommand,
    options?: { restartAudio?: boolean; keepFailures?: boolean },
  ) => {
    commit(
      transition(snapshot.queue, command, {
        availableTrackIds: snapshot.availableTrackIds,
        random,
      }),
      options,
    );
  };

  const dispatchSessionStart = (
    view: SessionSource,
    request: SessionRequest,
    options?: { keepFailures?: boolean },
  ) => {
    dispatch(
      {
        type: "startSession",
        source: view.source,
        entries: view.entries,
        filter: view.filter,
        sort: view.sort,
        sessionId: crypto.randomUUID(),
        ...request,
      },
      options,
    );
  };

  // A queue-end restart continues the advance that caused it, so a skipped track keeps its failure.
  const restartSession = (view: SessionSource, request: SessionRequest) =>
    dispatchSessionStart(view, request, { keepFailures: true });

  const userCommand =
    <Args extends unknown[]>(run: (...args: Args) => void) =>
    (...args: Args) => {
      if (!isReady(lifecycle)) return;
      playlistRestart = null;
      run(...args);
    };

  const restartFromPlaylist = async (
    restart: PlaylistRestart,
    sort: TrackSort,
    request: SessionRequest,
  ): Promise<void> => {
    const coveredBeforeRead = restart.coveredRevision;

    const read = await dependencies.playlistReader
      .read(restart.playlistId)
      .catch((error: Error) => {
        if (restart !== playlistRestart || restart.coveredRevision > coveredBeforeRead) return null;
        throw error;
      });

    if (restart !== playlistRestart) return;

    const readIsBehind = !read || read.revision < restart.coveredRevision;

    if (readIsBehind) return restartFromPlaylist(restart, sort, request);

    restart.coveredRevision = read.revision;
    const data = read.playlist;

    setFailure("sourceReload", false);

    if (data)
      restartSession(
        {
          source: { kind: "playlist", playlistId: data.id, title: data.title },
          entries: playlistEntries(data, snapshot.tracksById, sort),
          filter: null,
          sort,
        },
        request,
      );
  };

  const advance = ({ restartPaused = true } = {}) => {
    dispatch({ type: "next" });

    const queue = snapshot.queue;

    if (!queue || queue.playback.kind === "active" || queue.source.kind === "deleted-playlist")
      return;

    const request = {
      start: { kind: "first-available" },
      shuffled: queue.shuffleEnabled,
      paused: restartPaused,
    } satisfies SessionRequest;

    if (queue.tracking.kind === "frozen") {
      restartSession(
        {
          source: queue.source,
          entries: queue.sourceEntries.filter((entry) => snapshot.tracksById.has(entry.trackId)),
          filter: queue.tracking.filter,
          sort: queue.sort,
        },
        request,
      );

      return;
    }

    if (queue.source.kind === "all-tracks") {
      if (snapshot.library)
        restartSession(
          {
            source: queue.source,
            entries: libraryEntries(snapshot.library, queue.sort),
            filter: null,
            sort: queue.sort,
          },
          request,
        );

      return;
    }

    const restart = { playlistId: queue.source.playlistId, coveredRevision: -1 };
    playlistRestart = restart;
    void restartFromPlaylist(restart, queue.sort, request).catch(() =>
      setFailure("sourceReload", true),
    );
  };

  const previous = () => {
    if (
      snapshot.queue &&
      selectCurrentItem(snapshot.queue) &&
      dependencies.audio.readLivePosition() > 2
    ) {
      dependencies.audio.seek(0);
      persist(snapshot.queue, 0);

      return;
    }

    dispatch({ type: "previous" });
  };

  const resume = () => {
    setFailure("track", null);
    const current = selectCurrentItem(snapshot.queue);

    if (current && needsLoad()) {
      const trackId = current.trackId;

      if (snapshot.availableTrackIds.has(trackId)) {
        loadCurrent(dependencies.audio.readLivePosition(), true);

        return;
      }

      advance();
      setFailure("track", { kind: "unavailable", trackId, queueItemId: current.queueItemId });

      return;
    }

    if (snapshot.queue && !current) {
      advance({ restartPaused: false });

      return;
    }

    dependencies.audio.play();
  };

  const syncLibrary = (library: MusicLibrary) => {
    if (lifecycle === "closed") return;
    publish({
      ...snapshot,
      library,
      tracksById: new Map(library.tracks.map((track) => [track.id, track])),
      availableTrackIds: new Set(
        library.tracks.filter((track) => track.available).map((track) => track.id),
      ),
    });

    if (lifecycle !== "awaiting-library") {
      dispatch({
        type: "libraryRescanned",
        entries: libraryEntries(library, snapshot.queue?.sort ?? defaultSort),
      });

      const current = selectCurrentItem(snapshot.queue);

      if (current && snapshot.availableTrackIds.has(current.trackId) && needsLoad())
        loadCurrent(dependencies.audio.readLivePosition());

      return;
    }

    lifecycle = "restoring";
    void dependencies.storage
      .load()
      .then((raw) => {
        if (lifecycle === "closed") return;
        lifecycle = { kind: "ready", load: unloaded };
        const latestLibrary = snapshot.library ?? library;
        const restored = readSavedSession(raw, latestLibrary);

        if (restored && restored !== "unreadable") {
          const queue = transition(
            restored.state,
            {
              type: "libraryRescanned",
              entries: libraryEntries(latestLibrary, restored.state.sort),
            },
            { availableTrackIds: snapshot.availableTrackIds, random },
          );

          publish({ ...snapshot, queue });
          loadCurrent(restored.position, false);
        }

        publish({
          ...snapshot,
          isInitialized: true,
          failures: { ...snapshot.failures, restore: restored === "unreadable" },
        });
      })
      .catch((error) => {
        if (lifecycle === "closed") return;
        console.error("Could not load the saved playback session", error);
        lifecycle = { kind: "ready", load: unloaded };
        publish({
          ...snapshot,
          isInitialized: true,
          failures: { ...snapshot.failures, restore: true },
        });
      });
  };

  const handleAudioEvent = (event: AudioEvent) => {
    const current = selectCurrentItem(snapshot.queue);

    if (
      !isReady(lifecycle) ||
      lifecycle.load.kind !== "loaded" ||
      event.requestId !== lifecycle.load.requestId ||
      !current ||
      current.queueItemId !== event.queueItemId
    )
      return;

    if (event.type === "started") {
      dispatch({ type: "playbackStarted" });

      return;
    }

    if (event.type === "paused") {
      dispatch({ type: "playbackPaused" });

      return;
    }

    if (event.type === "ended") {
      if (selectPlaybackIntent(snapshot.queue) === "playing") advance();

      return;
    }

    const trackId = current.trackId;

    if (event.reason === "rejected") {
      dispatch({ type: "playbackPaused" });

      return;
    }

    // A failed element never recovers, so Play must load the track again.
    lifecycle = { kind: "ready", load: unloaded };
    failedTrackIds.add(trackId);

    if (selectPlaybackIntent(snapshot.queue) === "playing") advance();

    const failed: FailedTrack = {
      kind: "load",
      trackId,
      queueItemId: current.queueItemId,
      requestId: event.requestId,
      file: "checking",
    };

    setFailure("track", failed);

    // Chromium reports a gone file and an unreadable one with the same error, so ask the main process.
    void dependencies
      .hasTrackFile(trackId)
      .catch(() => true)
      .then((exists) => {
        if (snapshot.failures.track === failed)
          setFailure("track", { ...failed, file: exists ? "unreadable" : "missing" });
      });
  };

  return {
    applySourceChange: (change: SourceChange, revision: LibraryRevision) => {
      if (lifecycle === "closed") return;

      if (playlistRestart?.playlistId === change.playlistId) {
        if (revision <= playlistRestart.coveredRevision) return;

        playlistRestart.coveredRevision = revision;
      }

      dispatch(change);
    },
    clearManualQueue: userCommand(() => dispatch({ type: "clearManualQueue" })),
    enqueueTracks: userCommand((orderedTrackIds: readonly number[], position: QueuePosition) => {
      if (!snapshot.queue) return;
      dispatch({
        type: "enqueueTracks",
        items: orderedTrackIds.map((trackId) => ({ trackId, queueItemId: crypto.randomUUID() })),
        position,
      });
    }),
    flush: () => {
      lifecycle = "closed";
      playlistRestart = null;
      sessionWriter.close(
        snapshot.queue && {
          state: snapshot.queue,
          position: savedPosition(dependencies.audio.readLivePosition()),
        },
      );
    },
    getSnapshot: () => snapshot,
    handleAudioEvent,
    jumpToQueueItem: userCommand((queueItemId: string) =>
      dispatch({ type: "jumpTo", queueItemId }),
    ),
    moveQueueItem: userCommand(
      (input: Omit<Extract<QueueCommand, { type: "moveQueueItem" }>, "type">) =>
        dispatch({ type: "moveQueueItem", ...input }),
    ),
    next: userCommand(() => advance()),
    onPosition: (position: number) => {
      if (snapshot.queue) persist(snapshot.queue, position);
    },
    pause: userCommand(() => {
      dependencies.audio.pause();
      // Record the intent now. The element reports its pause a task later, or never when none is attached.
      dispatch({ type: "playbackPaused" });
    }),
    playSource: userCommand((view: SessionSource) =>
      dispatchSessionStart(view, { start: { kind: "first-available" }, shuffled: false }),
    ),
    playSourceEntry: userCommand((view: SessionSource, sourceEntryId: number) => {
      const queue = snapshot.queue;
      const selection = { source: view.source, filter: view.filter, sourceEntryId };

      if (selectsWithinShuffledSession(queue, selection)) {
        dispatch({ type: "selectSourceEntry", ...selection }, { restartAudio: true });

        return;
      }

      dispatchSessionStart(view, {
        start: { kind: "entry", sourceEntryId },
        shuffled: queue?.shuffleEnabled ?? false,
      });
    }),
    previous: userCommand(previous),
    removeQueueItem: userCommand((queueItemId: string) =>
      dispatch({ type: "removeQueueItem", queueItemId }),
    ),
    resume: userCommand(resume),
    seek: userCommand((position: number) => {
      dependencies.audio.seek(position);

      if (snapshot.queue) persist(snapshot.queue, dependencies.audio.readLivePosition());
    }),
    setShuffleEnabled: userCommand((enabled: boolean) => {
      if (!snapshot.queue || snapshot.queue.shuffleEnabled === enabled) return;
      dispatch({ type: "setShuffleEnabled", enabled });
    }),
    shufflePlay: userCommand((view: SessionSource) =>
      dispatchSessionStart(view, { start: { kind: "random" }, shuffled: true }),
    ),
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    syncLibrary,
  };
}
