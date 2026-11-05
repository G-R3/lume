import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";

type Attachment =
  | { kind: "detached" }
  | { kind: "attached"; requestId: string; audio: HTMLAudioElement };

type MediaLifecycle = { attachment: Attachment } & (
  | { kind: "empty" }
  | {
      kind: "requested";
      request: PlaybackRequest;
      intent: "play" | "pause";
      isPlaying: boolean;
      attempt: symbol | null;
      seek: { kind: "deferred"; position: number } | { kind: "direct" };
      duration: number;
      lastReportedSecond: number;
    }
);

/**
 * Loads and plays the selected track. Supports pausing and jumping to a time in the track.
 * Reports playback changes, such as the track ending, to the playback controller.
 */
export function useMediaElement(options: {
  onEvent: (event: AudioEvent) => void;
  onPosition: (position: number) => void;
}) {
  const lifecycleRef = useRef<MediaLifecycle>({ kind: "empty", attachment: { kind: "detached" } });
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const [view, setView] = useState<{
    request: PlaybackRequest | null;
    isPlaying: boolean;
    duration: number;
  }>({ request: null, isPlaying: false, duration: 0 });

  const request = view.request;
  const [audioPreferences, setAudioPreferences] = useState(loadAudioPreferences);
  const [timeStore] = useState(createAudioTimeStore);

  const commit = useCallback((next: MediaLifecycle) => {
    lifecycleRef.current = next;
    const request = next.kind === "requested" ? next.request : null;
    const isPlaying = next.kind === "requested" && next.isPlaying;
    const duration = next.kind === "requested" ? next.duration : 0;
    setView((current) =>
      current.request === request &&
      current.isPlaying === isPlaying &&
      current.duration === duration
        ? current
        : { request, isPlaying, duration },
    );
  }, []);

  const requestedLifecycle = useCallback((requestId: string) => {
    const current = lifecycleRef.current;

    return current.kind === "requested" && current.request.requestId === requestId ? current : null;
  }, []);

  const load = useCallback(
    (next: PlaybackRequest | null, position = next?.position ?? 0) => {
      commit(
        next
          ? {
              kind: "requested",
              request: next,
              attachment: lifecycleRef.current.attachment,
              intent: next.shouldPlay ? "play" : "pause",
              isPlaying: false,
              attempt: null,
              seek: { kind: "deferred", position: next.position },
              duration: next.durationHint,
              lastReportedSecond: -1,
            }
          : { kind: "empty", attachment: lifecycleRef.current.attachment },
      );
      timeStore.set(position);
    },
    [commit, timeStore],
  );

  const play = useCallback(() => {
    const current = lifecycleRef.current;

    if (current.kind === "empty") return;
    current.intent = "play";

    if (
      current.attachment.kind === "detached" ||
      current.attachment.requestId !== current.request.requestId
    )
      return;

    const attempt = Symbol();
    const audio = current.attachment.audio;
    current.attempt = attempt;
    void audio.play().catch(() => {
      const latest = requestedLifecycle(current.request.requestId);

      // A failed load also rejects play(); its media error reports why.
      if (!latest || latest.attempt !== attempt || audio.error) return;
      commit({ ...latest, intent: "pause", isPlaying: false });
      callbacksRef.current.onEvent({
        type: "error",
        requestId: current.request.requestId,
        queueItemId: current.request.queueItemId,
        reason: "rejected",
      });
    });
  }, [commit, requestedLifecycle]);

  useEffect(() => {
    if (request && requestedLifecycle(request.requestId)?.intent === "play") play();
  }, [requestedLifecycle, play, request]);

  const pause = useCallback(() => {
    const current = lifecycleRef.current;

    if (current.kind === "requested")
      commit({ ...current, intent: "pause", isPlaying: false, attempt: null });

    if (current.attachment.kind === "attached") current.attachment.audio.pause();
  }, [commit]);

  const isMuted = audioPreferences.muted || audioPreferences.volume === 0;

  const attachAudio = useCallback(
    (audio: HTMLAudioElement | null) => {
      if (!audio || !request) return;
      lifecycleRef.current.attachment = { kind: "attached", requestId: request.requestId, audio };
      audio.volume = audioPreferences.volume;

      return () => {
        const current = lifecycleRef.current;

        if (current.attachment.kind === "attached" && current.attachment.audio === audio)
          current.attachment = { kind: "detached" };
      };
    },
    [audioPreferences.volume, request],
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
      const current = lifecycleRef.current;

      if (current.kind === "empty" || !Number.isFinite(time)) return;

      const audio =
        current.attachment.kind === "attached" &&
        current.attachment.requestId === current.request.requestId
          ? current.attachment.audio
          : null;

      if (!audio || current.seek.kind === "deferred") {
        const position = Math.max(0, time);
        current.seek = { kind: "deferred", position };
        timeStore.set(position);
        callbacksRef.current.onPosition(position);

        return;
      }

      audio.currentTime = Math.max(
        0,
        Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time),
      );
      timeStore.set(audio.currentTime);
      current.lastReportedSecond = Math.floor(audio.currentTime) - 1;
      callbacksRef.current.onPosition(audio.currentTime);
    },
    [timeStore],
  );

  return {
    duration: view.duration,
    element: request && (
      <audio
        key={request.requestId}
        muted={isMuted}
        onDurationChange={(event) => {
          const current = requestedLifecycle(request.requestId);

          if (!current) return;

          const value = event.currentTarget.duration;

          if (Number.isFinite(value) && value > 0) commit({ ...current, duration: value });
        }}
        onEnded={() => {
          const current = requestedLifecycle(request.requestId);

          if (!current) return;

          commit({ ...current, intent: "pause", isPlaying: false });
          callbacksRef.current.onEvent({
            type: "ended",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onError={() => {
          const current = requestedLifecycle(request.requestId);

          if (!current) return;

          commit({ ...current, intent: "pause", isPlaying: false });
          callbacksRef.current.onEvent({
            type: "error",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
            reason: "load",
          });
        }}
        onLoadedMetadata={(event) => {
          const current = requestedLifecycle(request.requestId);

          if (!current) return;

          if (current.seek.kind === "direct") return;
          const position = current.seek.position;

          const audio = event.currentTarget;
          audio.currentTime = Math.min(
            position,
            Number.isFinite(audio.duration) ? audio.duration : position,
          );
          timeStore.set(audio.currentTime);
          current.lastReportedSecond = Math.floor(audio.currentTime) - 1;
          current.seek = { kind: "direct" };
        }}
        onPause={(event) => {
          const current = requestedLifecycle(request.requestId);

          if (!current || !event.currentTarget.paused) return;

          commit({ ...current, intent: "pause", isPlaying: false });

          if (event.currentTarget.ended) return;
          callbacksRef.current.onEvent({
            type: "paused",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onPlay={(event) => {
          const current = requestedLifecycle(request.requestId);

          if (!current || event.currentTarget.paused) return;

          if (current.intent === "pause") {
            event.currentTarget.pause();

            return;
          }

          commit({ ...current, isPlaying: true });
          callbacksRef.current.onEvent({
            type: "started",
            requestId: request.requestId,
            queueItemId: request.queueItemId,
          });
        }}
        onTimeUpdate={(event) => {
          const current = requestedLifecycle(request.requestId);

          if (!current) return;

          const position = event.currentTarget.currentTime;
          timeStore.set(position);
          const second = Math.floor(position);

          if (second > current.lastReportedSecond) {
            current.lastReportedSecond = second;
            callbacksRef.current.onPosition(position);
          }
        }}
        ref={attachAudio}
        src={request.url}
      />
    ),
    getPosition: timeStore.getSnapshot,
    isMuted,
    isPlaying: view.isPlaying,
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

export function createAudioTimeStore() {
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
