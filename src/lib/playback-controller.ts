import type { LumeApi, MusicLibrary, PlaylistDetails } from "../../shared/lib";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";
import { shuffleEntries } from "@/lib/fisher-yates";
import type { QueueCommand, QueuePosition, QueueRandom, SessionSource } from "@/lib/queue/commands";
import type { QueueState, SourceIdentity } from "@/lib/queue/model";
import { parseQueueSession, serializeQueueSession } from "@/lib/queue/persistence";
import { selectsWithinShuffledSession } from "@/lib/queue/shuffle";
import { libraryEntries, playlistEntries } from "@/lib/queue/source";
import { defaultSort, type TrackSort } from "@/lib/track-sort";
import { transition } from "@/lib/queue/transition";

type Snapshot = {
  queue: QueueState | null;
  library: MusicLibrary | null;
  isInitialized: boolean;
  errorMessage: string | null;
};

type SourceChange = Extract<
  QueueCommand,
  {
    type: "sourceEntriesAdded" | "sourceEntriesRemoved" | "sourceEntryMoved" | "sourceDeleted";
  }
>;

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

function savedPosition(position: number) {
  return Number.isFinite(position) ? Math.max(0, position) : 0;
}

export function createPlaybackController(dependencies: {
  audio: {
    load: (request: PlaybackRequest | null, position?: number) => void;
    getPosition: () => number;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
  };
  storage: LumeApi["playbackSession"];
  playlistReader: {
    read: (playlistId: number, refresh: boolean) => Promise<PlaylistDetails | null>;
  };
  random: () => number;
}) {
  const listeners = new Set<() => void>();
  const random = createQueueRandom(dependencies.random);
  const playlistRevisions = new Map<number, number>();
  let snapshot: Snapshot = { queue: null, library: null, isInitialized: false, errorMessage: null };
  let lifecycle: "awaiting-library" | "restoring" | "ready" | "closed" = "awaiting-library";
  let latestSourceRestart: symbol | null = null;
  let requestId: string | null = null;
  let pendingSave: { state: QueueState; position: number } | null = null;
  let savedState: QueueState | null = null;
  let saving = false;
  let tracksById = new Map<number, MusicLibrary["tracks"][number]>();
  let availableTrackIds = new Set<number>();

  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const setError = (errorMessage: string | null) => {
    if (lifecycle !== "closed" && snapshot.errorMessage !== errorMessage)
      publish({ ...snapshot, errorMessage });
  };

  const revisionOf = (playlistId: number) => playlistRevisions.get(playlistId) ?? 0;

  const savePending = async () => {
    if (saving) return;
    saving = true;

    while (pendingSave) {
      const next = pendingSave;
      pendingSave = null;
      const saveQueue = next.state !== savedState;
      savedState = next.state;

      await (
        saveQueue
          ? dependencies.storage.save({
              payload: serializeQueueSession(next.state),
              position: next.position,
            })
          : dependencies.storage.savePosition(next.position)
      ).catch((error: Error) => {
        savedState = null;
        setError(error.message || "Could not save playback");
      });
    }

    saving = false;
  };

  const persist = (state: QueueState, position: number) => {
    if (lifecycle === "closed") return;

    pendingSave = { state, position: savedPosition(position) };

    void Promise.resolve().then(savePending);
  };

  const loadCurrent = (position: number, shouldPlay = snapshot.queue?.status === "playing") => {
    const queue = snapshot.queue;
    const track = queue?.current ? tracksById.get(queue.current.item.trackId) : undefined;

    requestId = queue?.current && track?.available ? crypto.randomUUID() : null;

    dependencies.audio.load(
      queue?.current && track?.available && requestId
        ? {
            requestId,
            queueItemId: queue.current.item.queueItemId,
            url: track.url,
            shouldPlay,
            position,
            durationHint: track.duration && Number.isFinite(track.duration) ? track.duration : 0,
          }
        : null,
      position,
    );
  };

  const commit = (queue: QueueState | null, { restartAudio = false } = {}) => {
    const previous = snapshot.queue;

    if (!queue || queue === previous || lifecycle === "closed") return;

    const load =
      restartAudio || queue.current?.item.queueItemId !== previous?.current?.item.queueItemId;

    publish({ ...snapshot, queue, errorMessage: load ? null : snapshot.errorMessage });
    persist(queue, load ? 0 : dependencies.audio.getPosition());

    if (load) loadCurrent(0);
  };

  const dispatch = (command: QueueCommand, options?: { restartAudio?: boolean }) => {
    commit(transition(snapshot.queue, command, { availableTrackIds, random }), options);
  };

  const dispatchSessionStart = (view: SessionSource, request: SessionRequest) => {
    dispatch({
      type: "startSession",
      source: view.source,
      entries: view.entries,
      filter: view.filter,
      sort: view.sort,
      sessionId: crypto.randomUUID(),
      ...request,
    });
  };

  const userCommand =
    <Args extends unknown[]>(run: (...args: Args) => void) =>
    (...args: Args) => {
      if (lifecycle !== "ready") return;
      latestSourceRestart = null;
      run(...args);
    };

  const restartFromSource = async (
    source: SourceIdentity,
    sort: TrackSort,
    request: SessionRequest,
    restart: symbol,
    refresh = false,
  ): Promise<void> => {
    if (source.kind === "all-tracks") {
      if (snapshot.library)
        dispatchSessionStart(
          { source, entries: libraryEntries(snapshot.library, sort), filter: null, sort },
          request,
        );

      return;
    }

    const revision = revisionOf(source.playlistId);

    const data = await dependencies.playlistReader
      .read(source.playlistId, refresh)
      .catch((error: Error) => {
        if (restart !== latestSourceRestart || revision !== revisionOf(source.playlistId))
          return null;
        throw error;
      });

    if (restart !== latestSourceRestart) return;

    if (revision !== revisionOf(source.playlistId))
      return restartFromSource(source, sort, request, restart, true);

    if (data)
      dispatchSessionStart(
        {
          source: { kind: "playlist", playlistId: data.id, title: data.title },
          entries: playlistEntries(data, tracksById, sort),
          filter: null,
          sort,
        },
        request,
      );
  };

  const advance = () => {
    dispatch({ type: "next" });

    const queue = snapshot.queue;

    if (!queue || queue.current || queue.source.kind === "detached") return;

    const request = {
      start: { kind: "first-available" },
      shuffled: queue.shuffleEnabled,
      paused: true,
    } satisfies SessionRequest;

    if (queue.filter !== null) {
      dispatchSessionStart(
        {
          source: queue.source,
          entries: queue.sourceEntries.filter((entry) => tracksById.has(entry.trackId)),
          filter: queue.filter,
          sort: queue.sort,
        },
        request,
      );

      return;
    }

    const restart = Symbol();
    latestSourceRestart = restart;
    void restartFromSource(queue.sourceIdentity, queue.sort, request, restart).catch(
      (error: Error) => setError(error.message || "Could not load playback source"),
    );
  };

  const previous = () => {
    if (snapshot.queue?.current && dependencies.audio.getPosition() > 2) {
      dependencies.audio.seek(0);
      persist(snapshot.queue, 0);

      return;
    }

    dispatch({ type: "previous" });
  };

  const resume = () => {
    if (snapshot.queue?.current && requestId === null) {
      if (availableTrackIds.has(snapshot.queue.current.item.trackId)) {
        loadCurrent(dependencies.audio.getPosition(), true);
        setError(null);

        return;
      }

      advance();
      setError("This track is unavailable");

      return;
    }

    if (snapshot.queue && !snapshot.queue.current) {
      advance();

      return;
    }

    setError(null);
    dependencies.audio.play();
  };

  const syncLibrary = (library: MusicLibrary) => {
    if (lifecycle === "closed") return;
    tracksById = new Map(library.tracks.map((track) => [track.id, track] as const));
    availableTrackIds = new Set(
      library.tracks.filter((track) => track.available).map((track) => track.id),
    );
    publish({ ...snapshot, library });

    if (lifecycle !== "awaiting-library") {
      dispatch({
        type: "libraryRescanned",
        entries: libraryEntries(library, snapshot.queue?.sort ?? defaultSort),
      });

      if (
        snapshot.queue?.current &&
        availableTrackIds.has(snapshot.queue.current.item.trackId) &&
        requestId === null
      )
        loadCurrent(dependencies.audio.getPosition());

      return;
    }

    lifecycle = "restoring";
    void dependencies.storage
      .load()
      .then((raw) => {
        if (lifecycle === "closed") return;
        lifecycle = "ready";
        const latestLibrary = snapshot.library ?? library;
        const restored = parseQueueSession(raw, latestLibrary);

        if (restored) {
          const queue = transition(
            restored.state,
            {
              type: "libraryRescanned",
              entries: libraryEntries(latestLibrary, restored.state.sort),
            },
            { availableTrackIds, random },
          );

          publish({ ...snapshot, queue });
          loadCurrent(restored.position, false);
        }

        publish({ ...snapshot, isInitialized: true });
      })
      .catch((error: Error) => {
        if (lifecycle === "closed") return;
        lifecycle = "ready";
        publish({
          ...snapshot,
          errorMessage: error.message || "Could not restore playback",
          isInitialized: true,
        });
      });
  };

  const handleAudioEvent = (event: AudioEvent) => {
    const queue = snapshot.queue;

    if (
      lifecycle !== "ready" ||
      event.requestId !== requestId ||
      queue?.current?.item.queueItemId !== event.queueItemId
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
      if (queue.status === "playing") advance();

      return;
    }

    if (event.source === "play") dispatch({ type: "playbackPaused" });

    if (event.source === "media" && queue.status === "playing") advance();
    setError(event.message);
  };

  return {
    applySourceChange: (change: SourceChange) => {
      if (lifecycle === "closed") return;
      playlistRevisions.set(change.playlistId, revisionOf(change.playlistId) + 1);
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
      latestSourceRestart = null;
      pendingSave = null;

      // Electron handles sent saves before the final synchronous flush from this renderer.
      if (snapshot.queue)
        dependencies.storage.flush({
          payload: serializeQueueSession(snapshot.queue),
          position: savedPosition(dependencies.audio.getPosition()),
        });
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
    next: userCommand(advance),
    onPosition: (position: number) => {
      if (snapshot.queue) persist(snapshot.queue, position);
    },
    pause: userCommand(() => {
      dependencies.audio.pause();
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

      if (snapshot.queue) persist(snapshot.queue, dependencies.audio.getPosition());
    }),
    setError,
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
