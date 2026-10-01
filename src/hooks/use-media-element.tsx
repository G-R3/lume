import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";

/**
 * Loads and plays the selected track. Supports pausing and jumping to a time in the track.
 * Reports playback changes, such as the track ending, to the playback controller.
 */
export function useMediaElement(options: {
  onEvent: (event: AudioEvent) => void;
  onPosition: (position: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<PlaybackRequest | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const playbackAttemptRef = useRef(0);
  const lastReportedSecondRef = useRef(-1);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const [request, setRequest] = useState<PlaybackRequest | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState(loadAudioPreferences);
  const [duration, setDuration] = useState(0);
  const [timeStore] = useState(createAudioTimeStore);

  const load = useCallback(
    (next: PlaybackRequest | null, position = next?.position ?? 0) => {
      ++playbackAttemptRef.current;
      requestRef.current = next;
      pendingSeekRef.current = next?.position ?? null;
      lastReportedSecondRef.current = -1;
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

  const isMuted = audioPreferences.muted || audioPreferences.volume === 0;

  const attachAudio = useCallback(
    (audio: HTMLAudioElement | null) => {
      audioRef.current = audio;

      // Apply the saved level before a newly mounted track can start playing.
      if (audio) audio.volume = audioPreferences.volume;
    },
    [audioPreferences.volume],
  );

  useEffect(() => {
    try {
      localStorage.setItem("lume.audio", JSON.stringify(audioPreferences));
    } catch (error) {
      console.warn("Could not save audio preferences", error);
    }
  }, [audioPreferences]);

  const setVolume = useCallback(
    (volume: number) => setAudioPreferences({ volume, muted: false }),
    [],
  );

  const toggleMute = useCallback(
    () =>
      setAudioPreferences((current) => ({
        volume: current.volume === 0 ? 1 : current.volume,
        muted: current.volume === 0 ? false : !current.muted,
      })),
    [],
  );

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;

      if (!audio) return;

      audio.currentTime = Math.max(
        0,
        Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time),
      );
      timeStore.set(audio.currentTime);
      lastReportedSecondRef.current = Math.floor(audio.currentTime) - 1;
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
          const position = pendingSeekRef.current;

          if (position === null) return;

          const audio = event.currentTarget;
          audio.currentTime = Math.min(
            position,
            Number.isFinite(audio.duration) ? audio.duration : position,
          );
          timeStore.set(audio.currentTime);
          lastReportedSecondRef.current = Math.floor(audio.currentTime) - 1;
          pendingSeekRef.current = null;
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

          if (second > lastReportedSecondRef.current) {
            lastReportedSecondRef.current = second;
            callbacksRef.current.onPosition(position);
          }
        }}
        ref={attachAudio}
        src={request.url}
      />
    ),
    getPosition: timeStore.getSnapshot,
    hasRequest: () => requestRef.current !== null,
    isMuted,
    isPlaying,
    load,
    pause,
    play,
    seek,
    setVolume,
    timeStore,
    toggleMute,
    volume: audioPreferences.volume,
  };
}

function loadAudioPreferences() {
  try {
    const parsed = z
      .object({ volume: z.number().min(0).max(1), muted: z.boolean() })
      .safeParse(JSON.parse(localStorage.getItem("lume.audio") ?? "null"));

    if (parsed.success) return parsed.data;
  } catch (error) {
    console.warn("Could not load audio preferences", error);
  }

  return { volume: 1, muted: false };
}

function createAudioTimeStore() {
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
