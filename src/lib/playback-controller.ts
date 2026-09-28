import type { LumeApi, MusicLibrary } from "../../shared/lib";
import {
  parseQueueSession,
  serializeQueueSession,
  transition,
  type QueueCommand,
  type QueueState,
} from "@/lib/queue";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";

type Snapshot = {
  queue: QueueState | null;
  library: MusicLibrary | null;
  isInitialized: boolean;
  errorMessage: string | null;
};

export type QueueIntent =
  | Omit<Extract<QueueCommand, { type: "enqueueTrack" }>, "queueItemId">
  | Omit<Extract<QueueCommand, { type: "startFromSource" }>, "sessionId">
  | Exclude<QueueCommand, { type: "enqueueTrack" | "startFromSource" }>;

type SourceListItem = {
  sourceEntryId: number;
  track: { id: number };
};

/**
 * Loads the track selected by the queue and moves to the next track when audio ends or fails.
 * Pressing Previous after more than two seconds restarts the current track.
 * Saves the queue and playback position so they can be restored when the app reopens.
 */
export function createPlaybackController(
  audio: {
    load: (request: PlaybackRequest | null, position?: number) => void;
    getPosition: () => number;
    hasRequest: () => boolean;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
  },
  storage: LumeApi["playbackSession"],
  loadPlaylist: LumeApi["loadPlaylist"],
) {
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { queue: null, library: null, isInitialized: false, errorMessage: null };
  let sessionRestoreStarted = false;
  let closing = false;
  let saveChain = Promise.resolve();
  let tracksById = new Map<number, MusicLibrary["tracks"][number]>();
  let availableTrackIds = new Set<number>();

  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const setError = (errorMessage: string | null) => {
    if (snapshot.errorMessage !== errorMessage) publish({ ...snapshot, errorMessage });
  };

  const persist = (state: QueueState, position: number) => {
    const payload = serializeQueueSession(state, position);
    saveChain = saveChain
      .then(() => (closing ? undefined : storage.save(payload)))
      .catch((error: Error) => setError(error.message || "Could not save playback"));
  };

  const loadCurrent = (position: number, shouldPlay = snapshot.queue?.status === "playing") => {
    const queue = snapshot.queue;
    const track = queue?.current ? tracksById.get(queue.current.item.trackId) : undefined;

    audio.load(
      queue?.current && track?.available
        ? {
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

  const resetToSourceStart = async (queue: QueueState) => {
    if (queue.source.kind === "detached") return;

    const entries =
      queue.source.kind === "playlist"
        ? (await loadPlaylist(queue.source.playlistId))?.tracks.map((item) => ({
            sourceEntryId: item.id,
            trackId: item.trackId,
          }))
        : snapshot.library?.tracks.map((track) => ({ sourceEntryId: track.id, trackId: track.id }));

    // Loading the playlist takes time. Keep any queue changes made while waiting.
    if (closing || snapshot.queue !== queue) return;

    const first = entries?.find((item) => availableTrackIds.has(item.trackId));

    if (!entries || !first) return;

    dispatch({
      type: "startFromSource",
      source: queue.source,
      entries,
      startEntryId: first.sourceEntryId,
      startPaused: true,
    });
  };

  const dispatch = (command: QueueIntent) => {
    if (
      command.type === "startFromSource" &&
      !command.entries.some(
        (item) =>
          item.sourceEntryId === command.startEntryId && availableTrackIds.has(item.trackId),
      )
    )
      return;

    const queueCommand: QueueCommand =
      command.type === "enqueueTrack"
        ? { ...command, queueItemId: crypto.randomUUID() }
        : command.type === "startFromSource"
          ? { ...command, sessionId: crypto.randomUUID() }
          : command;

    const previous = snapshot.queue;

    const queue = transition(previous, queueCommand, availableTrackIds);

    if (!queue || queue === previous) return;

    const currentChanged = queue.current?.item.queueItemId !== previous?.current?.item.queueItemId;

    publish({ ...snapshot, queue });
    persist(queue, currentChanged ? 0 : audio.getPosition());

    if (currentChanged) {
      loadCurrent(0);
      setError(null);
    }

    if (command.type === "next" && !queue.current)
      void resetToSourceStart(queue).catch((error: Error) => {
        if (snapshot.queue === queue) setError(error.message || "Could not reset playback");
      });
  };

  const playFromSource = (items: readonly SourceListItem[], index: number, playlistId?: number) => {
    if (!snapshot.isInitialized || !items[index]) return;

    dispatch({
      type: "startFromSource",
      source:
        playlistId === undefined
          ? { kind: "all-tracks" }
          : {
              kind: "playlist",
              playlistId,
              title:
                snapshot.library?.playlists.find((playlist) => playlist.id === playlistId)?.title ??
                "Playlist",
            },
      entries: items.map((item) => ({
        sourceEntryId: item.sourceEntryId,
        trackId: item.track.id,
      })),
      startEntryId: items[index].sourceEntryId,
    });
  };

  const previous = () => {
    if (!snapshot.queue) return;

    if (snapshot.queue.current && audio.getPosition() > 2) {
      audio.seek(0);

      return;
    }

    dispatch({ type: "previous" });
  };

  const resume = () => {
    if (snapshot.queue?.current && !audio.hasRequest()) {
      if (availableTrackIds.has(snapshot.queue.current.item.trackId)) {
        loadCurrent(audio.getPosition(), true);
        setError(null);

        return;
      }

      dispatch({ type: "next", reason: "error" });
      setError("This track is unavailable");

      return;
    }

    if (snapshot.queue && !snapshot.queue.current) {
      dispatch({ type: "next", reason: "skip" });

      return;
    }

    setError(null);
    audio.play();
  };

  const pause = () => {
    audio.pause();
    dispatch({ type: "playbackPaused" });
  };

  const syncLibrary = (library: MusicLibrary) => {
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
        !audio.hasRequest()
      )
        loadCurrent(audio.getPosition());

      return;
    }

    sessionRestoreStarted = true;
    void storage
      .load()
      .then((raw) => {
        const latestLibrary = snapshot.library ?? library;
        const restored = parseQueueSession(raw, latestLibrary);

        if (restored) {
          const queue = transition(
            restored.state,
            {
              type: "libraryRescanned",
              entries: latestLibrary.tracks.map((track) => ({
                sourceEntryId: track.id,
                trackId: track.id,
              })),
            },
            availableTrackIds,
          );

          if (queue) {
            publish({ ...snapshot, queue });
            loadCurrent(restored.position);
          }
        }

        publish({ ...snapshot, isInitialized: true });
      })
      .catch((error: Error) => {
        publish({
          ...snapshot,
          errorMessage: error.message || "Could not restore playback",
          isInitialized: true,
        });
      });
  };

  const onAudioEvent = (event: AudioEvent) => {
    const queue = snapshot.queue;

    if (queue?.current?.item.queueItemId !== event.queueItemId) return;

    if (event.type === "started") {
      dispatch({ type: "playbackStarted" });

      return;
    }

    if (event.type === "paused") {
      dispatch({ type: "playbackPaused" });

      return;
    }

    if (event.type === "ended") {
      if (queue.status === "playing") dispatch({ type: "next", reason: "ended" });

      return;
    }

    if (event.source === "play") dispatch({ type: "playbackPaused" });

    if (event.source === "media" && queue.status === "playing")
      dispatch({ type: "next", reason: "error" });
    setError(event.message);
  };

  return {
    dispatch,
    flush: () => {
      closing = true;

      if (snapshot.queue) storage.flush(serializeQueueSession(snapshot.queue, audio.getPosition()));
    },
    getSnapshot: () => snapshot,
    onAudioEvent,
    onPosition: (position: number) => {
      if (snapshot.queue) persist(snapshot.queue, position);
    },
    pause,
    playFromSource,
    previous,
    resume,
    setError,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    syncLibrary,
  };
}
