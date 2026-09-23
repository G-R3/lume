import type { LumeApi, MusicLibrary } from "../../shared/lib";
import {
  parseQueueSession,
  serializeQueueSession,
  transition,
  type QueueCommand,
  type QueueState,
} from "@/lib/queue";

export type PlaybackRequest = {
  queueItemId: string;
  url: string;
  shouldPlay: boolean;
  position: number;
  durationHint: number;
};

export type AudioEvent =
  | { type: "started"; queueItemId: string }
  | { type: "paused"; queueItemId: string }
  | { type: "ended"; queueItemId: string }
  | { type: "error"; queueItemId: string; message: string; source: "play" | "media" };

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

export function createPlaybackCoordinator(
  audio: {
    load: (request: PlaybackRequest | null, position?: number) => void;
    getPosition: () => number;
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

      const source = snapshot.queue?.source;

      if (
        source?.kind === "playlist" &&
        !library.playlists.some((playlist) => playlist.id === source.playlistId)
      )
        dispatch({ type: "sourceDeleted", playlistId: source.playlistId });

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
    setError,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    syncLibrary,
  };
}
