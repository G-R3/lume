import React, {
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Track } from "../../shared/lib";

type AudioPlayerContextValue = {
  activeTrack: Track | null;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  duration: number;
  play: (track?: Track) => void;
  pause: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
};

type AudioPlayerTimeStore = ReturnType<typeof createAudioPlayerTimeStore>;

const AudioPlayerContext = React.createContext<AudioPlayerContextValue | null>(
  null,
);
const AudioPlayerTimeContext = React.createContext<AudioPlayerTimeStore | null>(
  null,
);

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);

  if (!context) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }

  return context;
}

// split the timer updates to a separate context. This should help consumers of the audio player providers
// from re-rendering everytime the timer is updated.
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
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeStore] = useState(createAudioPlayerTimeStore);
  const [duration, setDuration] = useState(0);

  const play = useCallback(
    (track?: Track) => {
      const playbackRequest = ++playbackRequestRef.current;
      setErrorMessage(null);

      if (track && activeTrack?.id !== track.id) {
        setIsPlaying(false);
        setActiveTrack(track);
        timeStore.set(0);

        // Use track duration metadata until the audio element
        // reports its decoded duration through onDurationChange
        // avoid having `0:00` duration on the UI and prevent the timer from exceeding the duration near the end
        setDuration(
          track.duration !== null &&
            Number.isFinite(track.duration) &&
            track.duration > 0
            ? track.duration
            : 0,
        );

        return;
      }

      const audio = audioPlayerRef.current;

      if (!audio) return;

      void audio.play().catch((error: DOMException) => {
        if (playbackRequest !== playbackRequestRef.current) return;

        setIsPlaying(false);
        setErrorMessage(error.message || "Playback failed");
      });
    },
    [activeTrack, timeStore],
  );

  const pause = useCallback(() => {
    const audio = audioPlayerRef.current;

    if (!audio || !activeTrack) return;

    ++playbackRequestRef.current;
    audio.pause();
    setIsPlaying(false);
  }, [activeTrack]);

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

  const contextValue = React.useMemo(
    () =>
      ({
        activeTrack,
        errorMessage,
        isPlaying,
        isMuted,
        duration,
        play,
        pause,
        toggleMute,
        seek,
      }) satisfies AudioPlayerContextValue,
    [
      activeTrack,
      errorMessage,
      isPlaying,
      isMuted,
      duration,
      play,
      pause,
      toggleMute,
      seek,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      <AudioPlayerTimeContext.Provider value={timeStore}>
        {children}
      </AudioPlayerTimeContext.Provider>
      {activeTrack && (
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
