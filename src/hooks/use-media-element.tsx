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
  const mountedRequestIdRef = useRef<string | null>(null);
  const shouldPlayRef = useRef(false);
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
      shouldPlayRef.current = next?.shouldPlay ?? false;
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
    shouldPlayRef.current = true;
    const audio = audioRef.current;
    const current = requestRef.current;

    if (!audio || !current || mountedRequestIdRef.current !== current.requestId) return;

    const attempt = ++playbackAttemptRef.current;
    void audio.play().catch((error: DOMException) => {
      if (
        attempt !== playbackAttemptRef.current ||
        requestRef.current?.requestId !== current.requestId
      )
        return;

      shouldPlayRef.current = false;
      setIsPlaying(false);
      callbacksRef.current.onEvent({
        type: "error",
        requestId: current.requestId,
        queueItemId: current.queueItemId,
        message: error.message || "Playback failed",
        source: "play",
      });
    });
  }, []);

  useEffect(() => {
    if (request && requestRef.current?.requestId === request.requestId && shouldPlayRef.current)
      play();
  }, [play, request]);

  const pause = useCallback(() => {
    shouldPlayRef.current = false;
    ++playbackAttemptRef.current;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const isMuted = audioPreferences.muted || audioPreferences.volume === 0;

  const attachAudio = useCallback(
    (audio: HTMLAudioElement | null) => {
      audioRef.current = audio;
      mountedRequestIdRef.current = audio ? (request?.requestId ?? null) : null;

      // Apply the saved level before a newly mounted track can start playing.
      if (audio) audio.volume = audioPreferences.volume;
    },
    [audioPreferences.volume, request?.requestId],
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

      const current = requestRef.current;

      if (!current || !Number.isFinite(time)) return;

      if (
        !audio ||
        mountedRequestIdRef.current !== current.requestId ||
        pendingSeekRef.current !== null
      ) {
        pendingSeekRef.current = Math.max(0, time);
        timeStore.set(pendingSeekRef.current);
        callbacksRef.current.onPosition(pendingSeekRef.current);

        return;
      }

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
        key={request.requestId}
        muted={isMuted}
        onDurationChange={(event) => {
          if (requestRef.current?.requestId !== request.requestId) return;

          const value = event.currentTarget.duration;

          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onEnded={() => {
          if (requestRef.current?.requestId !== request.requestId) return;

          shouldPlayRef.current = false;
          setIsPlaying(false);
          callbacksRef.current.onEvent({
            type: "ended",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onError={(event) => {
          if (requestRef.current?.requestId !== request.requestId) return;

          shouldPlayRef.current = false;
          setIsPlaying(false);
          callbacksRef.current.onEvent({
            type: "error",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
            message: event.currentTarget.error?.message || "Playback failed",
            source: "media",
          });
        }}
        onLoadedMetadata={(event) => {
          if (requestRef.current?.requestId !== request.requestId) return;

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
          if (requestRef.current?.requestId !== request.requestId || !event.currentTarget.paused)
            return;

          shouldPlayRef.current = false;
          setIsPlaying(false);

          if (event.currentTarget.ended) return;
          callbacksRef.current.onEvent({
            type: "paused",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onPlay={(event) => {
          if (requestRef.current?.requestId !== request.requestId || event.currentTarget.paused)
            return;

          if (!shouldPlayRef.current) {
            event.currentTarget.pause();

            return;
          }

          setIsPlaying(true);
          callbacksRef.current.onEvent({
            type: "started",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onTimeUpdate={(event) => {
          if (requestRef.current?.requestId !== request.requestId) return;

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
