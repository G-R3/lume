import React, { useCallback, useContext, useRef, useState } from "react";
import type { Track } from "../../shared/lib";

type AudioPlayerContextValue = {
  activeTrack: Track | null;
  errorMessage: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  play: (track?: Track) => void;
  pause: () => void;
  toggleMute: () => void;
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

  const play = useCallback(
    (track?: Track) => {
      const playbackRequest = ++playbackRequestRef.current;
      setErrorMessage(null);

      if (track && activeTrack?.id !== track.id) {
        setIsPlaying(false);
        setActiveTrack(track);
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

  const contextValue = React.useMemo(
    () =>
      ({
        activeTrack,
        errorMessage,
        isPlaying,
        isMuted,
        play,
        pause,
        toggleMute,
      }) satisfies AudioPlayerContextValue,
    [activeTrack, errorMessage, isPlaying, isMuted, play, pause, toggleMute],
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
      {activeTrack && (
        <audio
          autoPlay
          muted={isMuted}
          key={activeTrack.id}
          onEnded={() => setIsPlaying(false)}
          onError={(event) => {
            setIsPlaying(false);
            setErrorMessage(
              event.currentTarget.error?.message || "Playback failed",
            );
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          ref={audioPlayerRef}
          src={activeTrack.url}
        />
      )}
    </AudioPlayerContext.Provider>
  );
}
