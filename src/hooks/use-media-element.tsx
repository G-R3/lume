import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import {
  currentElement,
  emptyLifecycle,
  mediaTransition,
  mediaView,
  type ElementReport,
  type MediaEvent,
  type MediaLifecycle,
  type MediaView,
} from "@/lib/media-lifecycle";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";

/**
 * Loads and plays the selected track. Supports pausing and jumping to a time in the track.
 * Reports playback changes, such as the track ending, to the playback controller.
 */
export function useMediaElement(options: {
  onEvent: (event: AudioEvent) => void;
  onPosition: (position: number) => void;
}) {
  const lifecycleRef = useRef<MediaLifecycle<HTMLAudioElement>>(emptyLifecycle);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const [view, setView] = useState<MediaView>(() => mediaView(emptyLifecycle));
  const request = view.request;
  const [audioPreferences, setAudioPreferences] = useState(loadAudioPreferences);
  const [timeStore] = useState(createAudioTimeStore);

  const dispatch = useCallback(
    function dispatch(event: MediaEvent<HTMLAudioElement>) {
      const previous = mediaView(lifecycleRef.current);
      const step = mediaTransition(lifecycleRef.current, event);
      lifecycleRef.current = step.lifecycle;
      const next = mediaView(step.lifecycle);

      if (
        next.request !== previous.request ||
        next.isPlaying !== previous.isPlaying ||
        next.duration !== previous.duration
      )
        setView(next);

      const call = step.element;

      if (call?.type === "play")
        void call.element.play().catch(() =>
          dispatch({
            type: "element",
            element: call.element,
            report: {
              type: "playrejected",
              attempt: call.attempt,
              loadFailed: Boolean(call.element.error),
            },
          }),
        );

      if (call?.type === "pause") call.element.pause();

      if (call?.type === "seek") {
        call.element.currentTime = call.time;
        dispatch({
          type: "element",
          element: call.element,
          report: {
            type: "seekapplied",
            currentTime: call.element.currentTime,
            report: call.report,
          },
        });
      }

      if (step.position) {
        timeStore.set(step.position.time);

        if (step.position.report) callbacksRef.current.onPosition(step.position.time);
      }

      if (step.emit) callbacksRef.current.onEvent(step.emit);
    },
    [timeStore],
  );

  const load = useCallback(
    (next: PlaybackRequest | null, position = next?.position ?? 0) =>
      dispatch({ type: "load", request: next, position }),
    [dispatch],
  );

  const play = useCallback(() => dispatch({ type: "play" }), [dispatch]);
  const pause = useCallback(() => dispatch({ type: "pause" }), [dispatch]);

  const seek = useCallback(
    (time: number) =>
      dispatch({
        type: "seek",
        time,
        elementDuration: currentElement(lifecycleRef.current)?.duration ?? NaN,
      }),
    [dispatch],
  );

  useEffect(() => {
    if (request) dispatch({ type: "committed", requestId: request.requestId });
  }, [dispatch, request]);

  const isMuted = audioPreferences.muted || audioPreferences.volume === 0;

  const attachAudio = useCallback(
    (audio: HTMLAudioElement | null) => {
      if (!audio || !request) return;
      dispatch({ type: "attach", requestId: request.requestId, element: audio });
      audio.volume = audioPreferences.volume;

      return () => dispatch({ type: "detach", element: audio });
    },
    [audioPreferences.volume, dispatch, request],
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

  const reportFrom =
    (read: (audio: HTMLAudioElement) => ElementReport) =>
    (event: SyntheticEvent<HTMLAudioElement>) =>
      dispatch({
        type: "element",
        element: event.currentTarget,
        report: read(event.currentTarget),
      });

  return {
    duration: view.duration,
    element: request && (
      <audio
        key={request.requestId}
        muted={isMuted}
        onDurationChange={reportFrom((audio) => ({
          type: "durationchange",
          duration: audio.duration,
        }))}
        onEnded={reportFrom(() => ({ type: "ended" }))}
        onError={reportFrom(() => ({ type: "error" }))}
        onLoadedMetadata={reportFrom((audio) => ({
          type: "loadedmetadata",
          duration: audio.duration,
        }))}
        onPause={reportFrom((audio) => ({
          type: "pause",
          paused: audio.paused,
          ended: audio.ended,
        }))}
        onPlay={reportFrom((audio) => ({ type: "play", paused: audio.paused }))}
        onTimeUpdate={reportFrom((audio) => ({
          type: "timeupdate",
          currentTime: audio.currentTime,
        }))}
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
