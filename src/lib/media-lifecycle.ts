import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";

export type MediaLifecycle<Element> = {
  attachment: Attachment<Element>;
  rejectableAttempt: number;
} & (
  | { kind: "empty" }
  | {
      kind: "requested";
      request: PlaybackRequest;
      playback: Playback;
      seek: { kind: "deferred"; position: number } | { kind: "direct" };
      duration: number;
      reportedSecond: number;
    }
);

type Attachment<Element> =
  | { kind: "detached" }
  | { kind: "attached"; requestId: string; element: Element };

export type Playback =
  | { kind: "paused" }
  | { kind: "starting" }
  | { kind: "playing" }
  | { kind: "failed"; reason: "load" | "rejected" };

export type MediaEvent<Element> =
  | { type: "load"; request: PlaybackRequest | null; position: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; time: number; elementDuration: number }
  | { type: "committed"; requestId: string }
  | { type: "attach"; requestId: string; element: Element }
  | { type: "detach"; element: Element }
  | { type: "element"; element: Element; report: ElementReport };

export type ElementReport =
  | { type: "durationchange"; duration: number }
  | { type: "loadedmetadata"; duration: number }
  | { type: "timeupdate"; currentTime: number }
  | { type: "play"; paused: boolean }
  | { type: "pause"; paused: boolean; ended: boolean }
  | { type: "ended" }
  | { type: "error" }
  | { type: "playrejected"; attempt: number; loadFailed: boolean }
  | { type: "seekapplied"; currentTime: number; report: boolean };

export type MediaStep<Element> = {
  lifecycle: MediaLifecycle<Element>;
  element?: ElementCall<Element>;
  position?: { time: number; report: boolean };
  emit?: AudioEvent;
};

export type ElementCall<Element> =
  | { type: "play"; element: Element; attempt: number }
  | { type: "pause"; element: Element }
  | { type: "seek"; element: Element; time: number; report: boolean };

export type MediaView = { request: PlaybackRequest | null; isPlaying: boolean; duration: number };

type Requested<Element> = Extract<MediaLifecycle<Element>, { kind: "requested" }>;

export const emptyLifecycle: MediaLifecycle<never> = {
  kind: "empty",
  attachment: { kind: "detached" },
  rejectableAttempt: 0,
};

export function mediaView<Element>(lifecycle: MediaLifecycle<Element>): MediaView {
  return lifecycle.kind === "empty"
    ? { request: null, isPlaying: false, duration: 0 }
    : {
        request: lifecycle.request,
        isPlaying: lifecycle.playback.kind === "playing",
        duration: lifecycle.duration,
      };
}

export function currentElement<Element>(lifecycle: MediaLifecycle<Element>) {
  return lifecycle.kind === "requested" &&
    lifecycle.attachment.kind === "attached" &&
    lifecycle.attachment.requestId === lifecycle.request.requestId
    ? lifecycle.attachment.element
    : null;
}

export function mediaTransition<Element>(
  lifecycle: MediaLifecycle<Element>,
  event: MediaEvent<Element>,
): MediaStep<Element> {
  switch (event.type) {
    case "load":
      return load(lifecycle, event.request, event.position);
    case "attach":
      return {
        lifecycle: {
          ...lifecycle,
          attachment: { kind: "attached", requestId: event.requestId, element: event.element },
        },
      };
    case "detach":
      return lifecycle.attachment.kind === "attached" &&
        lifecycle.attachment.element === event.element
        ? { lifecycle: { ...lifecycle, attachment: { kind: "detached" } } }
        : { lifecycle };
    case "pause":
      return pause(lifecycle);
  }

  if (lifecycle.kind === "empty") return { lifecycle };

  switch (event.type) {
    case "play":
      return play(lifecycle);
    case "seek":
      return seek(lifecycle, event.time, event.elementDuration);
    case "committed":
      return event.requestId === lifecycle.request.requestId && wantsPlay(lifecycle.playback)
        ? play(lifecycle)
        : { lifecycle };
    case "element":
      return event.element === currentElement(lifecycle)
        ? report(lifecycle, event.element, event.report)
        : { lifecycle };
  }
}

function load<Element>(
  lifecycle: MediaLifecycle<Element>,
  request: PlaybackRequest | null,
  position: number,
): MediaStep<Element> {
  const kept = {
    attachment: lifecycle.attachment,
    rejectableAttempt: lifecycle.rejectableAttempt + 1,
  };

  return {
    lifecycle: request
      ? {
          ...kept,
          kind: "requested",
          request,
          playback: request.shouldPlay ? { kind: "starting" } : { kind: "paused" },
          seek: { kind: "deferred", position: request.position },
          duration: request.durationHint,
          reportedSecond: -1,
        }
      : { ...kept, kind: "empty" },
    position: { time: position, report: false },
  };
}

function wantsPlay(playback: Playback) {
  return playback.kind === "starting" || playback.kind === "playing";
}

function play<Element>(lifecycle: Requested<Element>): MediaStep<Element> {
  const playback: Playback =
    lifecycle.playback.kind === "playing" ? lifecycle.playback : { kind: "starting" };

  const element = currentElement(lifecycle);

  if (!element) return { lifecycle: { ...lifecycle, playback } };

  const attempt = lifecycle.rejectableAttempt + 1;

  return {
    lifecycle: { ...lifecycle, playback, rejectableAttempt: attempt },
    element: { type: "play", element, attempt },
  };
}

function pause<Element>(lifecycle: MediaLifecycle<Element>): MediaStep<Element> {
  const element =
    lifecycle.attachment.kind === "attached"
      ? ({ type: "pause", element: lifecycle.attachment.element } as const)
      : undefined;

  if (lifecycle.kind === "empty") return { lifecycle, element };

  return {
    lifecycle: {
      ...lifecycle,
      playback: { kind: "paused" },
      rejectableAttempt: lifecycle.rejectableAttempt + 1,
    },
    element,
  };
}

function seek<Element>(
  lifecycle: Requested<Element>,
  time: number,
  elementDuration: number,
): MediaStep<Element> {
  if (!Number.isFinite(time)) return { lifecycle };

  const element = currentElement(lifecycle);

  if (!element || lifecycle.seek.kind === "deferred") {
    const position = Math.max(0, time);

    return {
      lifecycle: { ...lifecycle, seek: { kind: "deferred", position } },
      position: { time: position, report: true },
    };
  }

  const target = Math.max(
    0,
    Math.min(time, Number.isFinite(elementDuration) ? elementDuration : time),
  );

  return { lifecycle, element: { type: "seek", element, time: target, report: true } };
}

function report<Element>(
  lifecycle: Requested<Element>,
  element: Element,
  report: ElementReport,
): MediaStep<Element> {
  const ids = {
    requestId: lifecycle.request.requestId,
    queueItemId: lifecycle.request.queueItemId,
  };

  const stopped = (playback: Playback): Playback =>
    lifecycle.playback.kind === "failed" ? lifecycle.playback : playback;

  switch (report.type) {
    case "durationchange":
      return Number.isFinite(report.duration) && report.duration > 0
        ? { lifecycle: { ...lifecycle, duration: report.duration } }
        : { lifecycle };
    case "loadedmetadata": {
      if (lifecycle.seek.kind === "direct") return { lifecycle };

      const { position } = lifecycle.seek;

      const time = Math.min(
        position,
        Number.isFinite(report.duration) ? report.duration : position,
      );

      return {
        lifecycle: { ...lifecycle, seek: { kind: "direct" } },
        element: { type: "seek", element, time, report: false },
      };
    }

    case "seekapplied":
      return {
        lifecycle: { ...lifecycle, reportedSecond: Math.floor(report.currentTime) - 1 },
        position: { time: report.currentTime, report: report.report },
      };
    case "timeupdate": {
      const second = Math.floor(report.currentTime);

      return second > lifecycle.reportedSecond
        ? {
            lifecycle: { ...lifecycle, reportedSecond: second },
            position: { time: report.currentTime, report: true },
          }
        : { lifecycle, position: { time: report.currentTime, report: false } };
    }

    case "play":
      if (report.paused) return { lifecycle };

      if (!wantsPlay(lifecycle.playback)) return { lifecycle, element: { type: "pause", element } };

      return {
        lifecycle: { ...lifecycle, playback: { kind: "playing" } },
        emit: { type: "started", ...ids },
      };
    case "pause":
      if (!report.paused) return { lifecycle };

      return {
        lifecycle: { ...lifecycle, playback: stopped({ kind: "paused" }) },
        emit: report.ended ? undefined : { type: "paused", ...ids },
      };
    case "ended":
      return {
        lifecycle: { ...lifecycle, playback: stopped({ kind: "paused" }) },
        emit: { type: "ended", ...ids },
      };
    case "error":
      return {
        lifecycle: { ...lifecycle, playback: { kind: "failed", reason: "load" } },
        emit: { type: "error", reason: "load", ...ids },
      };
    case "playrejected":
      if (report.loadFailed || report.attempt !== lifecycle.rejectableAttempt) return { lifecycle };

      return {
        lifecycle: { ...lifecycle, playback: { kind: "failed", reason: "rejected" } },
        emit: { type: "error", reason: "rejected", ...ids },
      };
  }
}
