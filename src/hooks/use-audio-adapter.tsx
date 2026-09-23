import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-coordinator";

export function useAudioAdapter(options: {
  onEvent: (event: AudioEvent) => void;
  onPosition: (position: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<PlaybackRequest | null>(null);
  const restorePositionRef = useRef<number | null>(null);
  const playbackAttemptRef = useRef(0);
  const lastPositionWriteRef = useRef(-1);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const [request, setRequest] = useState<PlaybackRequest | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [timeStore] = useState(createAudioPlayerTimeStore);

  const load = useCallback(
    (next: PlaybackRequest | null, position = next?.position ?? 0) => {
      ++playbackAttemptRef.current;
      requestRef.current = next;
      restorePositionRef.current = next?.position ?? null;
      lastPositionWriteRef.current = -1;
      timeStore.set(position);
      setDuration(next?.durationHint ?? 0);
      setIsPlaying(false);
      setRequest(next);
    },
    [timeStore],
  );

  const play = useCallback(() => {
    const audio = audioRef.current;
    const current = requestRef.current;

    if (!audio || !current) return;

    const attempt = ++playbackAttemptRef.current;
    void audio.play().catch((error: DOMException) => {
      if (
        attempt !== playbackAttemptRef.current ||
        requestRef.current?.queueItemId !== current.queueItemId
      )
        return;

      setIsPlaying(false);
      callbacksRef.current.onEvent({
        type: "error",
        queueItemId: current.queueItemId,
        message: error.message || "Playback failed",
        source: "play",
      });
    });
  }, []);

  useEffect(() => {
    if (request?.shouldPlay) play();
  }, [play, request]);

  const pause = useCallback(() => {
    ++playbackAttemptRef.current;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggleMute = useCallback(() => setIsMuted((value) => !value), []);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;

      if (!audio) return;

      audio.currentTime = Math.max(
        0,
        Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time),
      );
      timeStore.set(audio.currentTime);
      lastPositionWriteRef.current = Math.floor(audio.currentTime) - 1;
      callbacksRef.current.onPosition(audio.currentTime);
    },
    [timeStore],
  );

  return {
    duration,
    element: request && (
      <audio
        key={request.queueItemId}
        muted={isMuted}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;

          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onEnded={() => {
          if (requestRef.current?.queueItemId !== request.queueItemId) return;

          setIsPlaying(false);
          callbacksRef.current.onEvent({ type: "ended", queueItemId: request.queueItemId });
        }}
        onError={(event) => {
          if (requestRef.current?.queueItemId !== request.queueItemId) return;

          setIsPlaying(false);
          callbacksRef.current.onEvent({
            type: "error",
            queueItemId: request.queueItemId,
            message: event.currentTarget.error?.message || "Playback failed",
            source: "media",
          });
        }}
        onLoadedMetadata={(event) => {
          const position = restorePositionRef.current;

          if (position === null) return;

          const audio = event.currentTarget;
          audio.currentTime = Math.min(
            position,
            Number.isFinite(audio.duration) ? audio.duration : position,
          );
          timeStore.set(audio.currentTime);
          lastPositionWriteRef.current = Math.floor(audio.currentTime) - 1;
          restorePositionRef.current = null;
        }}
        onPause={(event) => {
          if (requestRef.current?.queueItemId !== request.queueItemId) return;

          setIsPlaying(false);

          if (event.currentTarget.ended) return;
          callbacksRef.current.onEvent({ type: "paused", queueItemId: request.queueItemId });
        }}
        onPlay={() => {
          if (requestRef.current?.queueItemId !== request.queueItemId) return;

          setIsPlaying(true);
          callbacksRef.current.onEvent({ type: "started", queueItemId: request.queueItemId });
        }}
        onTimeUpdate={(event) => {
          if (requestRef.current?.queueItemId !== request.queueItemId) return;

          const position = event.currentTarget.currentTime;
          timeStore.set(position);
          const second = Math.floor(position);

          if (second > lastPositionWriteRef.current) {
            lastPositionWriteRef.current = second;
            callbacksRef.current.onPosition(position);
          }
        }}
        ref={audioRef}
        src={request.url}
      />
    ),
    getPosition: timeStore.getSnapshot,
    isMuted,
    isPlaying,
    load,
    pause,
    play,
    seek,
    timeStore,
    toggleMute,
  };
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

      return () => listeners.delete(listener);
    },
  };
}
