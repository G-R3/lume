import React, { useCallback, useContext, useRef, useState } from "react";
import type { Track } from "../../shared/lib";

type AudioPlayerContextValue = {
  activeTrack: Track | null;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  scrubTime: number | null;
  play: (track?: Track) => void;
  pause: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  setScrubTime: React.Dispatch<React.SetStateAction<number | null>>;
};

const AudioPlayerContext = React.createContext<AudioPlayerContextValue | null>(
  null,
);

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);

  if (!context) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }

  return context;
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
  const [currentTime, setCurrentTime] = useState(0);
  // Scanned metadata seeds the UI, then the audio element replaces it with decoded duration.
  const [duration, setDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const play = useCallback(
    (track?: Track) => {
      const playbackRequest = ++playbackRequestRef.current;
      setErrorMessage(null);

      if (track && activeTrack?.id !== track.id) {
        setIsPlaying(false);
        setActiveTrack(track);
        setCurrentTime(0);
        setDuration(
          track.duration !== null && Number.isFinite(track.duration) && track.duration > 0
            ? track.duration
            : 0,
        );
        setScrubTime(null);
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
    [activeTrack],
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
    },
    [activeTrack],
  );

  const contextValue = React.useMemo(
    () =>
      ({
        activeTrack,
        errorMessage,
        isPlaying,
        isMuted,
        currentTime,
        duration,
        scrubTime,
        play,
        pause,
        toggleMute,
        seek,
        setScrubTime,
      }) satisfies AudioPlayerContextValue,
    [
      activeTrack,
      errorMessage,
      isPlaying,
      isMuted,
      currentTime,
      duration,
      scrubTime,
      play,
      pause,
      toggleMute,
      seek,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
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
            setCurrentTime(event.currentTarget.duration);
            setScrubTime(null);
          }}
          onError={(event) => {
            setIsPlaying(false);
            setScrubTime(null);
            setErrorMessage(
              event.currentTarget.error?.message || "Playback failed",
            );
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onSeeked={(event) => {
            // clearing scrubTime before `seeked` would briefly flicker the previous progress.
            setCurrentTime(event.currentTarget.currentTime);
            setScrubTime(null);
          }}
          ref={audioPlayerRef}
          src={activeTrack.url}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
          }}
        />
      )}
    </AudioPlayerContext.Provider>
  );
}
