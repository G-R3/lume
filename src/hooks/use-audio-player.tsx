import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MusicLibrary, Track } from "../../shared/lib";
import { useAudioAdapter } from "@/hooks/use-audio-adapter";
import { createPlaybackCoordinator, type QueueIntent } from "@/lib/playback-coordinator";
import { selectCanGoNext, selectQueueView } from "@/lib/queue";

type SourceListItem = { occurrenceId: number; track: Track };

type AudioPlayerContextValue = {
  activeQueueItemId: string | null;
  activeSourceOccurrenceId: number | null;
  activeSourcePlaylistId: number | null;
  activeTrack: Track | null;
  canGoNext: boolean;
  dispatchQueue: (command: QueueIntent) => void;
  duration: number;
  errorMessage: string | null;
  isMuted: boolean;
  isPlaying: boolean;
  queue: ReturnType<typeof selectQueueView>;
  ready: boolean;
  next: () => void;
  playFromSource: (items: readonly SourceListItem[], index: number, playlistId?: number) => void;
  previous: () => void;
  seek: (time: number) => void;
  syncLibrary: (library: MusicLibrary) => void;
  toggleMute: () => void;
  togglePlayback: () => void;
};

type AudioPlayerTimeStore = ReturnType<typeof useAudioAdapter>["timeStore"];

const AudioPlayerContext = React.createContext<AudioPlayerContextValue | null>(null);

const AudioPlayerTimeContext = React.createContext<AudioPlayerTimeStore | null>(null);

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);

  if (!context) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");

  return context;
}

// Audio progress does not rerender the queue or the rest of the player.
export function useAudioPlayerTime() {
  const store = useContext(AudioPlayerTimeContext);

  if (!store) throw new Error("useAudioPlayerTime must be used within AudioPlayerProvider");

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const coordinatorRef = useRef<ReturnType<typeof createPlaybackCoordinator> | null>(null);

  const audio = useAudioAdapter({
    onEvent: (event) => coordinatorRef.current?.onAudioEvent(event),
    onPosition: (position) => coordinatorRef.current?.onPosition(position),
  });

  const [coordinator] = useState(() =>
    createPlaybackCoordinator(
      { load: audio.load, getPosition: audio.getPosition },
      window.lume.playbackSession,
    ),
  );

  coordinatorRef.current = coordinator;
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);

  useEffect(() => {
    window.addEventListener("beforeunload", coordinator.flush);

    return () => window.removeEventListener("beforeunload", coordinator.flush);
  }, [coordinator]);

  const tracksById = useMemo(
    () => new Map(snapshot.library?.tracks.map((track) => [track.id, track]) ?? []),
    [snapshot.library],
  );

  const availableTrackIds = useMemo(
    () =>
      new Set(
        snapshot.library?.tracks.filter((track) => track.available).map((track) => track.id) ?? [],
      ),
    [snapshot.library],
  );

  const current = snapshot.queue?.current;
  const displayItem = current?.item ?? snapshot.queue?.lastItem;
  const activeTrack = displayItem ? (tracksById.get(displayItem.trackId) ?? null) : null;

  const activeSourceOccurrenceId =
    current?.lane === "source" && current.item.origin.kind === "source"
      ? current.item.origin.occurrenceId
      : null;

  const activeSourcePlaylistId =
    snapshot.queue?.source.kind === "playlist" ? snapshot.queue.source.playlistId : null;

  const playFromSource = useCallback(
    (items: readonly SourceListItem[], index: number, playlistId?: number) => {
      if (!snapshot.ready || !items[index]?.track.available) return;
      coordinator.dispatch({
        type: "startFromSource",
        source:
          playlistId === undefined
            ? { kind: "all-tracks" }
            : {
                kind: "playlist",
                playlistId,
                title:
                  coordinator
                    .getSnapshot()
                    .library?.playlists.find((playlist) => playlist.id === playlistId)?.title ??
                  "Playlist",
              },
        occurrences: items.map((item) => ({
          occurrenceId: item.occurrenceId,
          trackId: item.track.id,
        })),
        atOccurrenceId: items[index].occurrenceId,
      });
    },
    [coordinator, snapshot.ready],
  );

  const next = useCallback(
    () => coordinator.dispatch({ type: "next", reason: "skip" }),
    [coordinator],
  );

  const previous = useCallback(() => {
    const state = coordinator.getSnapshot().queue;

    if (!state) return;

    if (state.current && audio.getPosition() > 2) {
      audio.seek(0);

      return;
    }

    coordinator.dispatch({ type: "previous" });
  }, [audio, coordinator]);

  const resume = useCallback(() => {
    if (coordinator.getSnapshot().queue?.current && !audio.hasRequest()) {
      coordinator.dispatch({ type: "next", reason: "error" });
      coordinator.setError("This track is unavailable");

      return;
    }

    coordinator.setError(null);
    audio.play();
  }, [audio, coordinator]);

  const pause = useCallback(() => {
    audio.pause();
    coordinator.dispatch({ type: "playbackPaused" });
  }, [audio, coordinator]);

  const togglePlayback = useCallback(() => {
    if (audio.isPlaying) pause();
    else resume();
  }, [audio.isPlaying, pause, resume]);

  const contextValue = useMemo(
    () =>
      ({
        activeQueueItemId: current?.item.queueItemId ?? null,
        activeSourceOccurrenceId,
        activeSourcePlaylistId,
        activeTrack,
        canGoNext: selectCanGoNext(snapshot.queue, availableTrackIds),
        dispatchQueue: coordinator.dispatch,
        duration: audio.duration,
        errorMessage: snapshot.errorMessage,
        isMuted: audio.isMuted,
        isPlaying: audio.isPlaying,
        queue: selectQueueView(snapshot.queue),
        ready: snapshot.ready,
        next,
        playFromSource,
        previous,
        seek: audio.seek,
        syncLibrary: coordinator.syncLibrary,
        toggleMute: audio.toggleMute,
        togglePlayback,
      }) satisfies AudioPlayerContextValue,
    [
      activeSourceOccurrenceId,
      activeSourcePlaylistId,
      activeTrack,
      audio.duration,
      audio.isMuted,
      audio.isPlaying,
      audio.seek,
      audio.toggleMute,
      availableTrackIds,
      coordinator,
      current?.item.queueItemId,
      next,
      playFromSource,
      previous,
      snapshot.errorMessage,
      snapshot.queue,
      snapshot.ready,
      togglePlayback,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      <AudioPlayerTimeContext.Provider value={audio.timeStore}>
        {children}
      </AudioPlayerTimeContext.Provider>
      {audio.element}
    </AudioPlayerContext.Provider>
  );
}
