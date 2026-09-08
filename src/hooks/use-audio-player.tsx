import React, { useCallback, useContext, useRef, useState, useSyncExternalStore } from "react";
import type { Track } from "../../shared/lib";

type PlaybackSequence = {
  // Keep the active item separate so removing it from the queue cannot interrupt its audio.
  activeItem: PlaybackQueueItem;
  items: readonly PlaybackQueueItem[];
  nextIndex: number;
  playlistId: string | null;
};

type PlaybackQueueItem = {
  key: string;
  track: Track;
};

type AudioPlayerContextValue = {
  activeQueueKey: string | null;
  activeTrack: Track | null;
  clearPlaylistQueue: (playlistId: string) => void;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  duration: number;
  canGoNext: boolean;
  playFrom: (items: readonly PlaybackQueueItem[], index: number, playlistId?: string) => void;
  removeQueueItem: (key: string) => void;
  syncTracks: (tracks: readonly Track[]) => void;
  togglePlayback: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  next: () => void;
  previous: () => void;
};

type AudioPlayerTimeStore = ReturnType<typeof createAudioPlayerTimeStore>;

const AudioPlayerContext = React.createContext<AudioPlayerContextValue | null>(null);
const AudioPlayerTimeContext = React.createContext<AudioPlayerTimeStore | null>(null);

const previousTrackThreshold = 2;

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);

  if (!context) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }

  return context;
}

// keep frequent timer updates out of the main context so other controls do not
// rerender every time the audio element reports progress.
export function useAudioPlayerTime() {
  const store = useContext(AudioPlayerTimeContext);

  if (!store) {
    throw new Error("useAudioPlayerTime must be used within AudioPlayerProvider");
  }

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackRequestRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeStore] = useState(createAudioPlayerTimeStore);
  const [duration, setDuration] = useState(0);
  const [playbackSequence, setPlaybackSequence] = useState<PlaybackSequence | null>(null);

  const activeQueueKey = playbackSequence?.activeItem.key ?? null;
  const activeTrack = playbackSequence?.activeItem.track ?? null;

  const canGoNext = playbackSequence ? findNextAvailableTrackIndex(playbackSequence) !== -1 : false;

  const resume = useCallback(() => {
    const playbackRequest = ++playbackRequestRef.current;
    setErrorMessage(null);

    const audio = audioPlayerRef.current;

    if (!audio) return;

    void audio.play().catch((error: DOMException) => {
      if (playbackRequest !== playbackRequestRef.current) return;

      setIsPlaying(false);
      setErrorMessage(error.message || "Playback failed");
    });
  }, []);

  const pause = useCallback(() => {
    const audio = audioPlayerRef.current;

    if (!audio) return;

    ++playbackRequestRef.current;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }

    resume();
  }, [isPlaying, pause, resume]);

  const changeTrack = useCallback(
    (playbackSequence: PlaybackSequence, index: number) => {
      const item = playbackSequence.items[index];
      const track = item?.track;

      if (!track?.available) return;

      ++playbackRequestRef.current;
      setPlaybackSequence({ ...playbackSequence, activeItem: item, nextIndex: index + 1 });
      setErrorMessage(null);
      setIsPlaying(false);
      timeStore.set(0);

      // use track duration metadata until the audio element
      // reports its decoded duration through onDurationChange
      // avoid having `0:00` duration on the UI and prevent the timer from exceeding the duration near the end
      setDuration(
        track.duration !== null && Number.isFinite(track.duration) && track.duration > 0
          ? track.duration
          : 0,
      );
    },
    [timeStore],
  );

  const playFrom = useCallback(
    (items: readonly PlaybackQueueItem[], index: number, playlistId: string | null = null) => {
      const item = items[index];

      if (!item?.track.available) return;

      const playbackSequence = {
        activeItem: item,
        items,
        nextIndex: index + 1,
        playlistId,
      };

      if (activeQueueKey === item.key) {
        setPlaybackSequence(playbackSequence);
        resume();
        return;
      }

      changeTrack(playbackSequence, index);
    },
    [activeQueueKey, changeTrack, resume],
  );

  const syncTracks = useCallback((tracks: readonly Track[]) => {
    setPlaybackSequence((playbackSequence) => {
      if (!playbackSequence) return null;

      const tracksById = new Map(tracks.map((track) => [track.id, track]));

      return {
        ...playbackSequence,
        activeItem: {
          ...playbackSequence.activeItem,
          track:
            tracksById.get(playbackSequence.activeItem.track.id) ??
            playbackSequence.activeItem.track,
        },
        items: playbackSequence.items.map((item) => ({
          ...item,
          track: tracksById.get(item.track.id) ?? item.track,
        })),
      };
    });
  }, []);

  const removeQueueItem = useCallback((key: string) => {
    setPlaybackSequence((playbackSequence) => {
      if (!playbackSequence) return null;

      const removedIndex = playbackSequence.items.findIndex((item) => item.key === key);
      if (removedIndex === -1) return playbackSequence;

      return {
        ...playbackSequence,
        items: playbackSequence.items.filter((item) => item.key !== key),
        nextIndex:
          removedIndex < playbackSequence.nextIndex
            ? playbackSequence.nextIndex - 1
            : playbackSequence.nextIndex,
      };
    });
  }, []);

  const clearPlaylistQueue = useCallback((playlistId: string) => {
    setPlaybackSequence((playbackSequence) => {
      if (!playbackSequence || playbackSequence.playlistId !== playlistId) return playbackSequence;
      if (playbackSequence.nextIndex >= playbackSequence.items.length) return playbackSequence;

      return {
        ...playbackSequence,
        items: playbackSequence.items.slice(0, playbackSequence.nextIndex),
      };
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((isMuted) => !isMuted);
  }, []);

  const seek = useCallback(
    (time: number) => {
      const audio = audioPlayerRef.current;

      if (!audio) return;

      audio.currentTime = time;
      // update the timeStore timer before AudioPlayerProgress clears its previewTime to prevent a flicker on the slider.
      timeStore.set(audio.currentTime);
    },
    [timeStore],
  );

  const next = useCallback(() => {
    if (!playbackSequence) return;

    changeTrack(playbackSequence, findNextAvailableTrackIndex(playbackSequence));
  }, [changeTrack, playbackSequence]);

  const previous = useCallback(() => {
    if (!playbackSequence) return;

    const activeIndex = playbackSequence.items.findIndex(
      (item) => item.key === playbackSequence.activeItem.key,
    );
    const previousIndex = playbackSequence.items.findLastIndex(
      (item, index) =>
        index < (activeIndex === -1 ? playbackSequence.nextIndex : activeIndex) &&
        item.track.available,
    );

    if (previousIndex === -1 || Math.floor(timeStore.getSnapshot()) > previousTrackThreshold) {
      seek(0);
      return;
    }

    changeTrack(playbackSequence, previousIndex);
  }, [changeTrack, playbackSequence, seek, timeStore]);

  const contextValue = React.useMemo(
    () =>
      ({
        activeQueueKey,
        activeTrack,
        clearPlaylistQueue,
        errorMessage,
        isPlaying,
        isMuted,
        duration,
        canGoNext,
        playFrom,
        removeQueueItem,
        syncTracks,
        togglePlayback,
        toggleMute,
        seek,
        next,
        previous,
      }) satisfies AudioPlayerContextValue,
    [
      activeQueueKey,
      activeTrack,
      clearPlaylistQueue,
      errorMessage,
      isPlaying,
      isMuted,
      duration,
      canGoNext,
      playFrom,
      removeQueueItem,
      syncTracks,
      togglePlayback,
      toggleMute,
      seek,
      next,
      previous,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      <AudioPlayerTimeContext.Provider value={timeStore}>
        {children}
      </AudioPlayerTimeContext.Provider>
      {playbackSequence && activeTrack && (
        <audio
          autoPlay
          muted={isMuted}
          key={activeQueueKey}
          onDurationChange={(event) => {
            const duration = event.currentTarget.duration;

            if (!Number.isFinite(duration) || duration <= 0) return;
            setDuration(duration);
          }}
          onEnded={() => {
            if (canGoNext) next();
          }}
          onError={(event) => {
            setIsPlaying(false);
            setErrorMessage(event.currentTarget.error?.message || "Playback failed");
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          ref={audioPlayerRef}
          src={activeTrack.url}
          onTimeUpdate={(event) => {
            timeStore.set(event.currentTarget.currentTime);
          }}
        />
      )}
    </AudioPlayerContext.Provider>
  );
}

function findNextAvailableTrackIndex(playbackSequence: PlaybackSequence) {
  return playbackSequence.items.findIndex(
    (item, index) => index >= playbackSequence.nextIndex && item.track.available,
  );
}

function createAudioPlayerTimeStore() {
  const listeners = new Set<() => void>();
  let currentTime = 0;

  return {
    getSnapshot: () => currentTime,
    set: (time: number) => {
      if (!Number.isFinite(time) || time < 0 || time === currentTime) return;

      currentTime = time;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
