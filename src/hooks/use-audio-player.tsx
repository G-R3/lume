import React, {
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Track } from "../../shared/lib";

type PlaybackSequence = {
  tracks: readonly Track[];
  index: number;
};

type AudioPlayerContextValue = {
  activeTrack: Track | null;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  duration: number;
  canGoNext: boolean;
  playFrom: (tracks: readonly Track[], index: number) => void;
  resume: () => void;
  pause: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  next: () => void;
  previous: () => void;
};

type AudioPlayerTimeStore = ReturnType<typeof createAudioPlayerTimeStore>;

const AudioPlayerContext = React.createContext<AudioPlayerContextValue | null>(
  null,
);
const AudioPlayerTimeContext = React.createContext<AudioPlayerTimeStore | null>(
  null,
);

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
    throw new Error(
      "useAudioPlayerTime must be used within AudioPlayerProvider",
    );
  }

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function AudioPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackRequestRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeStore] = useState(createAudioPlayerTimeStore);
  const [duration, setDuration] = useState(0);
  const [playbackSequence, setPlaybackSequence] =
    useState<PlaybackSequence | null>(null);

  const activeTrack = playbackSequence
    ? playbackSequence.tracks[playbackSequence.index]
    : null;

  const canGoNext = playbackSequence
    ? playbackSequence.index < playbackSequence.tracks.length - 1
    : false;

  const resume = useCallback(() => {
    const playbackRequest = ++playbackRequestRef.current;
    setErrorMessage(null);

    const audio = audioPlayerRef.current;

    if (!audio || !activeTrack) return;

    void audio.play().catch((error: DOMException) => {
      if (playbackRequest !== playbackRequestRef.current) return;

      setIsPlaying(false);
      setErrorMessage(error.message || "Playback failed");
    });
  }, [activeTrack]);

  const pause = useCallback(() => {
    const audio = audioPlayerRef.current;

    if (!audio || !activeTrack) return;

    ++playbackRequestRef.current;
    audio.pause();
    setIsPlaying(false);
  }, [activeTrack]);

  const resetForTrack = useCallback(
    (track: Track) => {
      ++playbackRequestRef.current;
      setErrorMessage(null);
      setIsPlaying(false);
      timeStore.set(0);

      // use track duration metadata until the audio element
      // reports its decoded duration through onDurationChange
      // avoid having `0:00` duration on the UI and prevent the timer from exceeding the duration near the end
      setDuration(
        track.duration !== null &&
          Number.isFinite(track.duration) &&
          track.duration > 0
          ? track.duration
          : 0,
      );
    },
    [timeStore],
  );

  const playFrom = useCallback(
    (tracks: readonly Track[], index: number) => {
      const track = tracks[index];

      if (!track) return;

      setPlaybackSequence({ tracks, index });

      if (activeTrack?.id === track.id) {
        resume();
        return;
      }

      resetForTrack(track);
    },
    [activeTrack?.id, resetForTrack, resume],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((isMuted) => !isMuted);
  }, []);

  const seek = useCallback(
    (time: number) => {
      const audio = audioPlayerRef.current;

      if (!audio || !activeTrack) return;

      audio.currentTime = time;
      // update the timeStore timer before AudioPlayerProgress clears its previewTime to prevent a flicker on the slider.
      timeStore.set(audio.currentTime);
    },
    [activeTrack, timeStore],
  );

  const next = useCallback(() => {
    if (!playbackSequence) return;

    const index = playbackSequence.index + 1;
    const track = playbackSequence.tracks[index];

    if (!track) return;

    setPlaybackSequence({ tracks: playbackSequence.tracks, index });
    resetForTrack(track);
  }, [playbackSequence, resetForTrack]);

  const previous = useCallback(() => {
    if (!playbackSequence) return;

    if (
      playbackSequence.index === 0 ||
      Math.floor(timeStore.getSnapshot()) > previousTrackThreshold
    ) {
      seek(0);
      return;
    }

    const index = playbackSequence.index - 1;
    const track = playbackSequence.tracks[index];

    if (!track) return;

    setPlaybackSequence({ tracks: playbackSequence.tracks, index });
    resetForTrack(track);
  }, [playbackSequence, resetForTrack, seek, timeStore]);

  const contextValue = React.useMemo(
    () =>
      ({
        activeTrack,
        errorMessage,
        isPlaying,
        isMuted,
        duration,
        canGoNext,
        playFrom,
        resume,
        pause,
        toggleMute,
        seek,
        next,
        previous,
      }) satisfies AudioPlayerContextValue,
    [
      activeTrack,
      errorMessage,
      isPlaying,
      isMuted,
      duration,
      canGoNext,
      playFrom,
      resume,
      pause,
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
          key={activeTrack.id}
          onDurationChange={(event) => {
            const duration = event.currentTarget.duration;

            if (!Number.isFinite(duration) || duration <= 0) return;
            setDuration(duration);
          }}
          onEnded={(event) => {
            if (canGoNext) {
              next();
              return;
            }

            setIsPlaying(false);
            timeStore.set(event.currentTarget.duration);
          }}
          onError={(event) => {
            setIsPlaying(false);
            setErrorMessage(
              event.currentTarget.error?.message || "Playback failed",
            );
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onSeeked={(event) => {
            timeStore.set(event.currentTarget.currentTime);
          }}
          onSeeking={(event) => {
            timeStore.set(event.currentTarget.currentTime);
          }}
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
