import type { LumeApi, MusicLibrary } from "../../shared/lib";
import {
  parseQueueSession,
  prepareShuffle,
  prepareShufflePlay,
  prepareSourceEntryAddition,
  sameSource,
  serializeQueueSession,
  setShuffleEnabled,
  shufflePlay,
  transition,
  type QueueCommand,
  type QueueState,
  type SourceIdentity,
} from "@/lib/queue";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";
import type { PlaybackSource } from "@/lib/playback-source";
import { shuffleEntries } from "@/lib/shuffle";

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

/**
 * Loads the track selected by the queue and moves to the next track when audio ends or fails.
 * Pressing Previous after more than two seconds restarts the current track.
 * Saves the queue and playback position so they can be restored when the app reopens.
 */
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
  sourceReader: {
    read: (source: SourceIdentity, refresh?: boolean) => Promise<PlaybackSource | null>;
  };
  random: () => number;
}) {
  const listeners = new Set<() => void>();
  const sourceRevisions = new Map<number, number>();
  let snapshot: Snapshot = { queue: null, library: null, isInitialized: false, errorMessage: null };
  let sessionRestoreStarted = false;
  let closing = false;
  let actionId = 0;
  let requestId: string | null = null;
  let pendingSave: { state: QueueState; position: number } | null = null;
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

  const savePending = async () => {
    if (saving || closing) return;
    saving = true;

    // Save only the latest pending state after the current save finishes
    while (pendingSave && !closing) {
      const next = pendingSave;
      pendingSave = null;

      await dependencies.storage
        .save(serializeQueueSession(next.state, next.position))
        .catch((error: Error) => {
          setError(error.message || "Could not save playback");
        });
    }

    saving = false;
  };

  const persist = (state: QueueState, position: number) => {
    if (closing) return;
    pendingSave = { state, position };
    // Wait until synchronous queue and audio changes are complete
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

  const commit = (queue: QueueState | null, restart = false) => {
    const previous = snapshot.queue;

    if (!queue || (queue === previous && !restart) || closing) return;
    const load = restart || queue.current?.item.queueItemId !== previous?.current?.item.queueItemId;

    if (queue !== previous) publish({ ...snapshot, queue });
    persist(queue, load ? 0 : dependencies.audio.getPosition());

    if (!load) return;
    loadCurrent(0);
    setError(null);
  };

  const dispatch = (command: QueueCommand, restart = false) => {
    commit(transition(snapshot.queue, command, availableTrackIds), restart);
  };

  const startSource = async (
    source: SourceIdentity,
    options: { shuffled: boolean; sourceEntryId?: number; paused?: boolean },
    initiatingAction: number,
    refresh = false,
  ): Promise<void> => {
    const revision = source.kind === "playlist" ? (sourceRevisions.get(source.playlistId) ?? 0) : 0;

    const data =
      source.kind === "all-tracks"
        ? snapshot.library && {
            source,
            entries: snapshot.library.tracks.map((track) => ({
              sourceEntryId: track.id,
              trackId: track.id,
            })),
          }
        : await dependencies.sourceReader.read(source, refresh).catch((error: Error) => {
            if (
              closing ||
              initiatingAction !== actionId ||
              revision !== (sourceRevisions.get(source.playlistId) ?? 0)
            )
              return null;
            throw error;
          });

    if (closing || initiatingAction !== actionId) return;

    // Refresh a changed source before selecting entries for the latest queue state.
    if (source.kind === "playlist" && revision !== (sourceRevisions.get(source.playlistId) ?? 0))
      return startSource(source, options, initiatingAction, true);

    if (!data) return;

    const prepared = prepareShufflePlay(
      snapshot.queue,
      data.source,
      data.entries,
      crypto.randomUUID(),
      availableTrackIds,
      options.sourceEntryId,
    );

    if (!prepared) return;

    if (options.shuffled) {
      const startEntryId = options.paused
        ? prepared.availableStartEntryIds[0]
        : options.sourceEntryId;

      const selected =
        startEntryId === prepared.startEntryId ? prepared : { ...prepared, startEntryId };

      commit(
        shufflePlay(
          snapshot.queue,
          selected,
          shuffleEntries(selected.entries, dependencies.random).map((entry) => entry.sourceEntryId),
          options.paused,
        ),
      );

      return;
    }

    dispatch({
      type: "startFromSource",
      source: data.source,
      entries: prepared.entries,
      startEntryId: options.sourceEntryId ?? prepared.availableStartEntryIds[0],
      sessionId: prepared.sessionId,
      startPaused: options.paused,
    });
  };

  const runSourceAction = (
    source: SourceIdentity,
    options: { shuffled: boolean; sourceEntryId?: number; paused?: boolean },
    initiatingAction = ++actionId,
  ) => {
    if (!snapshot.isInitialized || closing) return Promise.resolve();

    return startSource(source, options, initiatingAction).catch((error: Error) => {
      if (initiatingAction === actionId)
        setError(error.message || "Could not load playback source");
    });
  };

  const advance = (reason: "skip" | "ended" | "error") => {
    if (closing || !snapshot.isInitialized) return;
    const initiatingAction = ++actionId;
    dispatch({ type: "next", reason });
    const queue = snapshot.queue;

    if (!queue || queue.current || queue.source.kind === "detached") return;
    void runSourceAction(
      queue.sourceIdentity,
      { shuffled: queue.shuffleEnabled, paused: true },
      initiatingAction,
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

      advance("error");
      setError("This track is unavailable");

      return;
    }

    if (snapshot.queue && !snapshot.queue.current) {
      advance("skip");

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
      dispatch({
        type: "libraryRescanned",
        entries: library.tracks.map((track) => ({ sourceEntryId: track.id, trackId: track.id })),
      });

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
        const restored = parseQueueSession(raw, snapshot.library ?? library);

        if (restored) {
          const queue = transition(
            restored.state,
            {
              type: "libraryRescanned",
              entries: (snapshot.library ?? library).tracks.map((track) => ({
                sourceEntryId: track.id,
                trackId: track.id,
              })),
            },
            availableTrackIds,
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
      if (queue.status === "playing") advance("ended");

      return;
    }

    if (event.source === "play") dispatch({ type: "playbackPaused" });

    if (event.source === "media" && queue.status === "playing") advance("error");
    setError(event.message);
  };

  return {
    applySourceChange: (change: SourceChange) => {
      if (closing) return;
      sourceRevisions.set(change.playlistId, (sourceRevisions.get(change.playlistId) ?? 0) + 1);

      if (change.type !== "sourceEntryAdded") {
        dispatch(change);

        return;
      }

      const prepared = prepareSourceEntryAddition(snapshot.queue, change);

      if (!prepared) return;
      dispatch({
        ...prepared.command,
        insertionIndex:
          prepared.insertionPositions === null
            ? undefined
            : Math.floor(dependencies.random() * prepared.insertionPositions),
      });
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
        dependencies.storage.flush(
          serializeQueueSession(snapshot.queue, dependencies.audio.getPosition()),
        );
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
    next: () => advance("skip"),
    onPosition: (position: number) => {
      if (snapshot.queue) persist(snapshot.queue, position);
    },
    pause,
    playSource: (source: SourceIdentity) => runSourceAction(source, { shuffled: false }),
    playSourceEntry: (input: { source: SourceIdentity; sourceEntryId: number }) => {
      if (!snapshot.isInitialized || closing) return Promise.resolve();
      const queue = snapshot.queue;

      if (
        queue?.shuffleEnabled &&
        sameSource(queue.sourceIdentity, input.source) &&
        queue.source.kind !== "detached"
      ) {
        ++actionId;
        const next = transition(queue, { type: "selectSourceEntry", ...input }, availableTrackIds);

        if (next !== queue) commit(next, true);

        return Promise.resolve();
      }

      return runSourceAction(input.source, {
        shuffled: queue?.shuffleEnabled ?? false,
        sourceEntryId: input.sourceEntryId,
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
      const queue = snapshot.queue;

      if (!queue || queue.shuffleEnabled === enabled || closing) return;
      ++actionId;
      const prepared = prepareShuffle(queue, enabled);

      if (!prepared) return;
      commit(
        setShuffleEnabled(
          queue,
          enabled,
          prepared,
          enabled
            ? shuffleEntries(prepared.entries, dependencies.random).map(
                (entry) => entry.sourceEntryId,
              )
            : [],
        ),
      );
    },
    shufflePlay: (source: SourceIdentity) => runSourceAction(source, { shuffled: true }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    syncLibrary,
  };
}
