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
import { useMediaElement } from "@/hooks/use-media-element";
import { createPlaybackController, type QueueIntent } from "@/lib/playback-controller";
import { selectCanGoNext, selectQueueView } from "@/lib/queue";

type PlaybackContextValue = {
  activeQueueItemId: string | null;
  activeSourceEntryId: number | null;
  activeSourcePlaylistId: number | null;
  activeTrack: Track | null;
  canGoNext: boolean;
  dispatchQueue: (command: QueueIntent) => void;
  duration: number;
  errorMessage: string | null;
  isMuted: boolean;
  isPlaying: boolean;
  queue: ReturnType<typeof selectQueueView>;
  isInitialized: boolean;
  next: () => void;
  playFromSource: ReturnType<typeof createPlaybackController>["playFromSource"];
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  syncLibrary: (library: MusicLibrary) => void;
  toggleMute: () => void;
  togglePlayback: () => void;
  volume: number;
};

type PlaybackTimeStore = ReturnType<typeof useMediaElement>["timeStore"];

const PlaybackContext = React.createContext<PlaybackContextValue | null>(null);

const PlaybackTimeContext = React.createContext<PlaybackTimeStore | null>(null);

/** Lets components read the queue and control playback. */
export function usePlayback() {
  const context = useContext(PlaybackContext);

  if (!context) throw new Error("usePlayback must be used within PlaybackProvider");

  return context;
}

/** Updates components that show playback time without rerendering those that only use the queue. */
export function usePlaybackTime() {
  const store = useContext(PlaybackTimeContext);

  if (!store) throw new Error("usePlaybackTime must be used within PlaybackProvider");

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Connects the queue to audio playback and lets child components use the playback hooks. */
export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const controllerRef = useRef<ReturnType<typeof createPlaybackController> | null>(null);

  const media = useMediaElement({
    onEvent: (event) => controllerRef.current?.onAudioEvent(event),
    onPosition: (position) => controllerRef.current?.onPosition(position),
  });

  const [controller] = useState(() =>
    createPlaybackController(
      {
        load: media.load,
        getPosition: media.getPosition,
        hasRequest: media.hasRequest,
        play: media.play,
        pause: media.pause,
        seek: media.seek,
      },
      window.lume.playbackSession,
      window.lume.loadPlaylist,
    ),
  );

  controllerRef.current = controller;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    window.addEventListener("beforeunload", controller.flush);

    return () => window.removeEventListener("beforeunload", controller.flush);
  }, [controller]);

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
  const displayItem = current?.item ?? snapshot.queue?.lastSelectedItem;
  const activeTrack = displayItem ? (tracksById.get(displayItem.trackId) ?? null) : null;

  const activeSourceEntryId =
    snapshot.queue?.source.kind !== "detached" &&
    current?.participatesInSourceNavigation &&
    current.lane === "source" &&
    current.item.origin.kind === "source"
      ? current.item.origin.sourceEntryId
      : null;

  const activeSourcePlaylistId =
    snapshot.queue?.source.kind === "playlist" ? snapshot.queue.source.playlistId : null;

  const next = useCallback(
    () => controller.dispatch({ type: "next", reason: "skip" }),
    [controller],
  );

  const togglePlayback = useCallback(() => {
    if (media.isPlaying) controller.pause();
    else controller.resume();
  }, [controller, media.isPlaying]);

  const contextValue = useMemo(
    () =>
      ({
        activeQueueItemId: current?.item.queueItemId ?? null,
        activeSourceEntryId,
        activeSourcePlaylistId,
        activeTrack,
        canGoNext: selectCanGoNext(snapshot.queue, availableTrackIds),
        dispatchQueue: controller.dispatch,
        duration: media.duration,
        errorMessage: snapshot.errorMessage,
        isMuted: media.isMuted,
        isPlaying: media.isPlaying,
        queue: selectQueueView(snapshot.queue),
        isInitialized: snapshot.isInitialized,
        next,
        playFromSource: controller.playFromSource,
        previous: controller.previous,
        seek: media.seek,
        setVolume: media.setVolume,
        syncLibrary: controller.syncLibrary,
        toggleMute: media.toggleMute,
        togglePlayback,
        volume: media.volume,
      }) satisfies PlaybackContextValue,
    [
      activeSourceEntryId,
      activeSourcePlaylistId,
      activeTrack,
      media.duration,
      media.isMuted,
      media.isPlaying,
      media.seek,
      media.setVolume,
      media.toggleMute,
      media.volume,
      availableTrackIds,
      controller,
      current?.item.queueItemId,
      next,
      snapshot.errorMessage,
      snapshot.queue,
      snapshot.isInitialized,
      togglePlayback,
    ],
  );

  return (
    <PlaybackContext.Provider value={contextValue}>
      <PlaybackTimeContext.Provider value={media.timeStore}>
        {children}
      </PlaybackTimeContext.Provider>
      {media.element}
    </PlaybackContext.Provider>
  );
}
