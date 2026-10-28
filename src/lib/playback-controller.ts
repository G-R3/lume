import type { LumeApi, MusicLibrary } from "../../shared/lib";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";
import { shuffleEntries } from "@/lib/fisher-yates";
import type { QueueCommand, QueueRandom, SessionSource } from "@/lib/queue/commands";
import type { QueueState, SourceIdentity } from "@/lib/queue/model";
import { parseQueueSession, serializeQueueSession } from "@/lib/queue/persistence";
import { selectsWithinShuffledSession } from "@/lib/queue/shuffle";
import { libraryEntries } from "@/lib/queue/source";
import { transition } from "@/lib/queue/transition";

type Snapshot = {
  queue: QueueState | null;
  library: MusicLibrary | null;
  isInitialized: boolean;
  errorMessage: string | null;
};

type SourceChange = Extract<
  QueueCommand,
  { type: "sourceEntryAdded" | "sourceEntryRemoved" | "sourceEntryMoved" | "sourceDeleted" }
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
    hasRequest: () => boolean;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
  };
  storage: LumeApi["playbackSession"];
  playlistReader: {
    read: (playlistId: number, refresh: boolean) => Promise<SessionSource | null>;
  };
  random: () => number;
}) {
  const listeners = new Set<() => void>();
  const random = createQueueRandom(dependencies.random);
  const playlistRevisions = new Map<number, number>();
  let snapshot: Snapshot = { queue: null, library: null, isInitialized: false, errorMessage: null };
  let sessionRestoreStarted = false;
  let closing = false;
  let actionId = 0;
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
    if (!closing && snapshot.errorMessage !== errorMessage) publish({ ...snapshot, errorMessage });
  };

  const revisionOf = (playlistId: number) => playlistRevisions.get(playlistId) ?? 0;

  const savePending = async () => {
    if (saving || closing) return;
    saving = true;

    while (pendingSave && !closing) {
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
    if (closing) return;

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

    if (!queue || queue === previous || closing) return;

    const load =
      restartAudio || queue.current?.item.queueItemId !== previous?.current?.item.queueItemId;

    publish({ ...snapshot, queue });
    persist(queue, load ? 0 : dependencies.audio.getPosition());

    if (!load) return;
    loadCurrent(0);
    setError(null);
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
      sessionId: crypto.randomUUID(),
      ...request,
    });
  };

  const startFromView = (view: SessionSource, request: SessionRequest) => {
    if (!snapshot.isInitialized || closing) return;
    ++actionId;
    dispatchSessionStart(view, request);
  };

  const restartFromSource = async (
    source: SourceIdentity,
    request: SessionRequest,
    initiatingAction: number,
    refresh = false,
  ): Promise<void> => {
    if (source.kind === "all-tracks") {
      if (snapshot.library)
        dispatchSessionStart(
          { source, entries: libraryEntries(snapshot.library), filter: null },
          request,
        );

      return;
    }

    const revision = revisionOf(source.playlistId);

    const data = await dependencies.playlistReader
      .read(source.playlistId, refresh)
      .catch((error: Error) => {
        if (closing || initiatingAction !== actionId || revision !== revisionOf(source.playlistId))
          return null;
        throw error;
      });

    if (closing || initiatingAction !== actionId) return;

    if (revision !== revisionOf(source.playlistId))
      return restartFromSource(source, request, initiatingAction, true);

    if (data) dispatchSessionStart(data, request);
  };

  const advance = () => {
    if (closing || !snapshot.isInitialized) return;
    const initiatingAction = ++actionId;

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
        },
        request,
      );

      return;
    }

    void restartFromSource(queue.sourceIdentity, request, initiatingAction).catch(
      (error: Error) => {
        if (initiatingAction === actionId)
          setError(error.message || "Could not load playback source");
      },
    );
  };

  const previous = () => {
    if (!snapshot.queue || closing) return;
    ++actionId;

    if (snapshot.queue.current && dependencies.audio.getPosition() > 2) {
      dependencies.audio.seek(0);
      persist(snapshot.queue, 0);

      return;
    }

    dispatch({ type: "previous" });
  };

  const resume = () => {
    if (closing || !snapshot.isInitialized) return;
    ++actionId;

    if (snapshot.queue?.current && !dependencies.audio.hasRequest()) {
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

  const pause = () => {
    if (closing) return;
    ++actionId;
    dependencies.audio.pause();
    dispatch({ type: "playbackPaused" });
  };

  const syncLibrary = (library: MusicLibrary) => {
    if (closing) return;
    tracksById = new Map(library.tracks.map((track) => [track.id, track] as const));
    availableTrackIds = new Set(
      library.tracks.filter((track) => track.available).map((track) => track.id),
    );
    publish({ ...snapshot, library });

    if (sessionRestoreStarted) {
      dispatch({ type: "libraryRescanned", entries: libraryEntries(library) });

      if (
        snapshot.queue?.current &&
        availableTrackIds.has(snapshot.queue.current.item.trackId) &&
        !dependencies.audio.hasRequest()
      )
        loadCurrent(dependencies.audio.getPosition());

      return;
    }

    sessionRestoreStarted = true;
    void dependencies.storage
      .load()
      .then((raw) => {
        if (closing) return;
        const latestLibrary = snapshot.library ?? library;
        const restored = parseQueueSession(raw, latestLibrary);

        if (restored) {
          const queue = transition(
            restored.state,
            { type: "libraryRescanned", entries: libraryEntries(latestLibrary) },
            { availableTrackIds, random },
          );

          publish({ ...snapshot, queue });
          loadCurrent(restored.position, false);
        }

        publish({ ...snapshot, isInitialized: true });
      })
      .catch((error: Error) => {
        if (!closing)
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
      closing ||
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
      if (closing) return;
      playlistRevisions.set(change.playlistId, revisionOf(change.playlistId) + 1);
      dispatch(change);
    },
    enqueueTrack: (trackId: number) => {
      if (closing || !snapshot.isInitialized) return;
      ++actionId;
      dispatch({ type: "enqueueTrack", trackId, queueItemId: crypto.randomUUID() });
    },
    flush: () => {
      closing = true;
      ++actionId;
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
    jumpToQueueItem: (queueItemId: string) => {
      if (closing || !snapshot.isInitialized) return;
      ++actionId;
      dispatch({ type: "jumpTo", queueItemId });
    },
    moveQueueItem: (input: Omit<Extract<QueueCommand, { type: "moveQueueItem" }>, "type">) => {
      if (closing || !snapshot.isInitialized) return;
      ++actionId;
      dispatch({ type: "moveQueueItem", ...input });
    },
    next: advance,
    onPosition: (position: number) => {
      if (snapshot.queue) persist(snapshot.queue, position);
    },
    pause,
    playSource: (view: SessionSource) =>
      startFromView(view, { start: { kind: "first-available" }, shuffled: false }),
    playSourceEntry: (view: SessionSource, sourceEntryId: number) => {
      if (!snapshot.isInitialized || closing) return;
      const queue = snapshot.queue;
      const selection = { source: view.source, filter: view.filter, sourceEntryId };

      if (selectsWithinShuffledSession(queue, selection)) {
        ++actionId;
        dispatch({ type: "selectSourceEntry", ...selection }, { restartAudio: true });

        return;
      }

      startFromView(view, {
        start: { kind: "entry", sourceEntryId },
        shuffled: queue?.shuffleEnabled ?? false,
      });
    },
    previous,
    removeQueueItem: (queueItemId: string) => {
      if (closing || !snapshot.isInitialized) return;
      ++actionId;
      dispatch({ type: "removeQueueItem", queueItemId });
    },
    resume,
    seek: (position: number) => {
      if (closing) return;
      ++actionId;
      dependencies.audio.seek(position);

      if (snapshot.queue) persist(snapshot.queue, dependencies.audio.getPosition());
    },
    setError,
    setShuffleEnabled: (enabled: boolean) => {
      if (closing || !snapshot.queue || snapshot.queue.shuffleEnabled === enabled) return;
      ++actionId;
      dispatch({ type: "setShuffleEnabled", enabled });
    },
    shufflePlay: (view: SessionSource) =>
      startFromView(view, { start: { kind: "random" }, shuffled: true }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    syncLibrary,
  };
}
