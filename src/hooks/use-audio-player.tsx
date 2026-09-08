import React, { useCallback, useContext, useRef, useState, useSyncExternalStore } from "react";
import type { Track } from "../../shared/lib";

type PlaybackSequence = {
  items: readonly PlaybackQueueItem[];
  index: number;
};

type PlaybackQueueItem = {
  key: string;
  track: Track;
};

type AudioPlayerContextValue = {
  activeQueueKey: string | null;
  activeTrack: Track | null;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  duration: number;
  canGoNext: boolean;
  playFrom: (items: readonly PlaybackQueueItem[], index: number) => void;
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

  const activeItem = playbackSequence ? playbackSequence.items[playbackSequence.index] : null;
  const activeQueueKey = activeItem?.key ?? null;
  const activeTrack = activeItem?.track ?? null;

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
    (items: readonly PlaybackQueueItem[], index: number) => {
      const track = items[index]?.track;

      if (!track?.available) return;

      ++playbackRequestRef.current;
      setPlaybackSequence({ items, index });
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
    (items: readonly PlaybackQueueItem[], index: number) => {
      const item = items[index];

      if (!item?.track.available) return;

      if (activeQueueKey === item.key) {
        setPlaybackSequence({ items, index });
        resume();
        return;
      }

      changeTrack(items, index);
    },
    [activeQueueKey, changeTrack, resume],
  );

  const syncTracks = useCallback((tracks: readonly Track[]) => {
    setPlaybackSequence((playbackSequence) => {
      if (!playbackSequence) return null;

      const tracksById = new Map(tracks.map((track) => [track.id, track]));

      return {
        ...playbackSequence,
        items: playbackSequence.items.map((item) => ({
          ...item,
          track: tracksById.get(item.track.id) ?? item.track,
        })),
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

    changeTrack(playbackSequence.items, findNextAvailableTrackIndex(playbackSequence));
  }, [changeTrack, playbackSequence]);

  const previous = useCallback(() => {
    if (!playbackSequence) return;

    const previousIndex = playbackSequence.items.findLastIndex(
      (item, index) => index < playbackSequence.index && item.track.available,
    );

    if (previousIndex === -1 || Math.floor(timeStore.getSnapshot()) > previousTrackThreshold) {
      seek(0);
      return;
    }

    changeTrack(playbackSequence.items, previousIndex);
  }, [changeTrack, playbackSequence, seek, timeStore]);

  const contextValue = React.useMemo(
    () =>
      ({
        activeQueueKey,
        activeTrack,
        errorMessage,
        isPlaying,
        isMuted,
        duration,
        canGoNext,
        playFrom,
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
      errorMessage,
      isPlaying,
      isMuted,
      duration,
      canGoNext,
      playFrom,
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
    (item, index) => index > playbackSequence.index && item.track.available,
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
