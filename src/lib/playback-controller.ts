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
  ready: boolean;
  errorMessage: string | null;
};

export type QueueIntent =
  | Omit<Extract<QueueCommand, { type: "addNext" }>, "queueItemId">
  | Omit<Extract<QueueCommand, { type: "startFromSource" }>, "sessionId">
  | Exclude<QueueCommand, { type: "addNext" | "startFromSource" }>;

type SourceListItem = {
  occurrenceId: number;
  track: { id: number };
};

/**
 * Coordinates the queue and audio element. Sends actions to the queue, loads
 * the item it selects, and responds when audio ends or fails. Also handles the
 * two-second Previous restart rule and saves the session.
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
) {
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { queue: null, library: null, ready: false, errorMessage: null };
  let hydrationStarted = false;
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

  const dispatch = (command: QueueIntent) => {
    if (
      command.type === "startFromSource" &&
      !command.occurrences.some(
        (item) =>
          item.occurrenceId === command.atOccurrenceId && availableTrackIds.has(item.trackId),
      )
    )
      return;

    const queueCommand: QueueCommand =
      command.type === "addNext"
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

    if (!currentChanged) return;

    const track = queue.current ? tracksById.get(queue.current.item.trackId) : undefined;

    audio.load(
      queue.current && track?.available
        ? {
            queueItemId: queue.current.item.queueItemId,
            url: track.url,
            shouldPlay: queue.status === "playing",
            position: 0,
            durationHint: track.duration && Number.isFinite(track.duration) ? track.duration : 0,
          }
        : null,
    );
    setError(null);
  };

  const playFromSource = (items: readonly SourceListItem[], index: number, playlistId?: number) => {
    if (!snapshot.ready || !items[index]) return;

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
      occurrences: items.map((item) => ({
        occurrenceId: item.occurrenceId,
        trackId: item.track.id,
      })),
      atOccurrenceId: items[index].occurrenceId,
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
      dispatch({ type: "next", reason: "error" });
      setError("This track is unavailable");

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

    if (hydrationStarted) {
      dispatch({
        type: "libraryRescanned",
        occurrences: library.tracks.map((track) => ({ occurrenceId: track.id, trackId: track.id })),
      });

      return;
    }

    hydrationStarted = true;
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
              occurrences: latestLibrary.tracks.map((track) => ({
                occurrenceId: track.id,
                trackId: track.id,
              })),
            },
            availableTrackIds,
          );

          if (queue) {
            const item = queue.current?.item;
            const track = item ? tracksById.get(item.trackId) : undefined;

            publish({ ...snapshot, queue });
            audio.load(
              item && track?.available
                ? {
                    queueItemId: item.queueItemId,
                    url: track.url,
                    shouldPlay: false,
                    position: restored.position,
                    durationHint:
                      track.duration && Number.isFinite(track.duration) ? track.duration : 0,
                  }
                : null,
              restored.position,
            );
          }
        }

        publish({ ...snapshot, ready: true });
      })
      .catch((error: Error) => {
        publish({
          ...snapshot,
          errorMessage: error.message || "Could not restore playback",
          ready: true,
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
