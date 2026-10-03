import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MusicLibrary, Track } from "../../shared/lib";
import { useMediaElement } from "@/hooks/use-media-element";
import { createPlaybackController } from "@/lib/playback-controller";
import { createPlaybackSourceReader } from "@/lib/playback-source";
import { selectActiveSourceEntryId, selectCanGoNext, selectQueueView } from "@/lib/queue";

type PlaybackContextValue = Pick<
  ReturnType<typeof createPlaybackController>,
  | "applySourceChange"
  | "enqueueTrack"
  | "jumpToQueueItem"
  | "moveQueueItem"
  | "playSource"
  | "playSourceEntry"
  | "removeQueueItem"
  | "setShuffleEnabled"
  | "shufflePlay"
> & {
  shuffleEnabled: boolean;
  activeQueueItemId: string | null;
  activeSourceEntryId: number | null;
  activeSourcePlaylistId: number | null;
  activeTrack: Track | null;
  canGoNext: boolean;
  duration: number;
  errorMessage: string | null;
  isMuted: boolean;
  isPlaying: boolean;
  queue: ReturnType<typeof selectQueueView>;
  isInitialized: boolean;
  next: () => void;
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
  const queryClient = useQueryClient();
  const controllerRef = useRef<ReturnType<typeof createPlaybackController> | null>(null);

  const media = useMediaElement({
    onEvent: (event) => controllerRef.current?.handleAudioEvent(event),
    onPosition: (position) => controllerRef.current?.onPosition(position),
  });

  const [controller] = useState(() =>
    createPlaybackController({
      audio: {
        load: media.load,
        getPosition: media.getPosition,
        hasRequest: media.hasRequest,
        play: media.play,
        pause: media.pause,
        seek: media.seek,
      },
      storage: window.lume.playbackSession,
      sourceReader: createPlaybackSourceReader(queryClient),
      random: Math.random,
    }),
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

  const activeSourceEntryId = selectActiveSourceEntryId(snapshot.queue);

  const activeSourcePlaylistId =
    snapshot.queue?.source.kind === "playlist" ? snapshot.queue.source.playlistId : null;

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
        applySourceChange: controller.applySourceChange,
        enqueueTrack: controller.enqueueTrack,
        jumpToQueueItem: controller.jumpToQueueItem,
        moveQueueItem: controller.moveQueueItem,
        playSource: controller.playSource,
        playSourceEntry: controller.playSourceEntry,
        removeQueueItem: controller.removeQueueItem,
        setShuffleEnabled: controller.setShuffleEnabled,
        shufflePlay: controller.shufflePlay,
        shuffleEnabled: snapshot.queue?.shuffleEnabled ?? false,
        duration: media.duration,
        errorMessage: snapshot.errorMessage,
        isMuted: media.isMuted,
        isPlaying: media.isPlaying,
        queue: selectQueueView(snapshot.queue),
        isInitialized: snapshot.isInitialized,
        next: controller.next,
        previous: controller.previous,
        seek: controller.seek,
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
      media.setVolume,
      media.toggleMute,
      media.volume,
      availableTrackIds,
      controller,
      current?.item.queueItemId,
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
