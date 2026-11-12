import { describe, expect, it } from "vite-plus/test";
import {
  currentElement,
  emptyLifecycle,
  mediaTransition,
  mediaView,
  type ElementReport,
  type MediaEvent,
  type MediaLifecycle,
  type MediaStep,
} from "./media-lifecycle";
import type { PlaybackRequest } from "./playback-media";

type Audio = { name: string };

const a: Audio = { name: "a" };

const b: Audio = { name: "b" };

function request(id: string, shouldPlay = false): PlaybackRequest {
  return {
    requestId: id,
    queueItemId: `item-${id}`,
    url: `file:///${id}.wav`,
    shouldPlay,
    position: 12,
    durationHint: 60,
  };
}

function run(events: MediaEvent<Audio>[], from: MediaLifecycle<Audio> = emptyLifecycle) {
  const steps: MediaStep<Audio>[] = [];
  let lifecycle = from;

  for (const event of events) {
    const step = mediaTransition(lifecycle, event);
    steps.push(step);
    lifecycle = step.lifecycle;
  }

  return { lifecycle, steps, last: steps.at(-1)! };
}

const report = (element: Audio, value: ElementReport): MediaEvent<Audio> => ({
  type: "element",
  element,
  report: value,
});

const seek = (time: number, elementDuration = NaN): MediaEvent<Audio> => ({
  type: "seek",
  time,
  elementDuration,
});

const loadA = (shouldPlay = false): MediaEvent<Audio>[] => [
  { type: "load", request: request("a", shouldPlay), position: 12 },
  { type: "attach", requestId: "a", element: a },
];

const playbackOf = (lifecycle: MediaLifecycle<Audio>) =>
  lifecycle.kind === "requested" ? lifecycle.playback : null;

const ids = { requestId: "a", queueItemId: "item-a" };

describe("load", () => {
  it("publishes the given position without reporting it and defers the request position", () => {
    const { lifecycle, last } = run([{ type: "load", request: request("a"), position: 7 }]);
    expect(last.position).toEqual({ time: 7, report: false });
    expect(mediaView(lifecycle)).toEqual({ request: request("a"), isPlaying: false, duration: 60 });
    expect(lifecycle.kind === "requested" && lifecycle.seek).toEqual({
      kind: "deferred",
      position: 12,
    });
  });

  it("makes play, seek and element reports inert after unloading", () => {
    const { lifecycle } = run([...loadA(true), { type: "load", request: null, position: 19 }]);
    expect(lifecycle.kind).toBe("empty");

    for (const event of [
      { type: "play" },
      seek(30),
      report(a, { type: "ended" }),
    ] satisfies MediaEvent<Audio>[])
      expect(mediaTransition(lifecycle, event)).toEqual({ lifecycle });
  });

  it("still pauses the outgoing element after unloading", () => {
    const { lifecycle } = run([...loadA(true), { type: "load", request: null, position: 19 }]);
    expect(mediaTransition(lifecycle, { type: "pause" })).toEqual({
      lifecycle,
      element: { type: "pause", element: a },
    });
  });

  it("keeps the element when the same request id is loaded again", () => {
    const { lifecycle, last } = run([
      ...loadA(),
      { type: "load", request: request("a", true), position: 0 },
      { type: "play" },
    ]);

    expect(currentElement(lifecycle)).toBe(a);
    expect(last.element).toEqual({ type: "play", element: a, attempt: 3 });
    expect(mediaTransition(lifecycle, report(a, { type: "ended" })).emit).toEqual({
      type: "ended",
      ...ids,
    });
  });
});

describe("staleness", () => {
  it.each<ElementReport>([
    { type: "durationchange", duration: 5 },
    { type: "loadedmetadata", duration: 5 },
    { type: "timeupdate", currentTime: 4 },
    { type: "play", paused: false },
    { type: "pause", paused: true, ended: false },
    { type: "ended" },
    { type: "error" },
    { type: "playrejected", attempt: 1, loadFailed: false },
    { type: "seekapplied", currentTime: 4, report: true },
  ])(
    "ignores $type from the previous request's element before and after React commits",
    (value) => {
      const pending = run([
        ...loadA(true),
        { type: "committed", requestId: "a" },
        { type: "load", request: request("b"), position: 30 },
      ]).lifecycle;

      expect(mediaTransition(pending, report(a, value))).toEqual({ lifecycle: pending });

      const committed = run(
        [
          { type: "detach", element: a },
          { type: "attach", requestId: "b", element: b },
        ],
        pending,
      ).lifecycle;

      expect(mediaTransition(committed, report(a, value))).toEqual({ lifecycle: committed });
    },
  );

  it("does not play or seek an element attached for an older request", () => {
    const { lifecycle } = run([
      ...loadA(),
      report(a, { type: "loadedmetadata", duration: 60 }),
      { type: "load", request: request("b"), position: 0 },
    ]);

    expect(mediaTransition(lifecycle, { type: "play" }).element).toBeUndefined();
    expect(mediaTransition(lifecycle, seek(5, 60)).element).toBeUndefined();
    expect(mediaTransition(lifecycle, { type: "committed", requestId: "a" })).toEqual({
      lifecycle,
    });
  });

  it("detaches only the element it attached and keeps everything else through a ref replay", () => {
    const attached = run([...loadA(true), seek(22)]).lifecycle;
    expect(mediaTransition(attached, { type: "detach", element: b })).toEqual({
      lifecycle: attached,
    });

    const replayed = run(
      [
        { type: "detach", element: a },
        { type: "attach", requestId: "a", element: a },
      ],
      attached,
    ).lifecycle;

    expect(replayed).toEqual(attached);
  });
});

describe("play", () => {
  it("starts a requested play once React commits, not when the element attaches", () => {
    const { steps } = run([...loadA(true), { type: "committed", requestId: "a" }]);
    expect(steps.map((step) => step.element)).toEqual([
      undefined,
      undefined,
      { type: "play", element: a, attempt: 2 },
    ]);
  });

  it("records a play before the element exists without calling it", () => {
    const { lifecycle, last } = run([
      { type: "load", request: request("a"), position: 0 },
      { type: "play" },
    ]);

    expect(last.element).toBeUndefined();
    expect(playbackOf(lifecycle)).toEqual({ kind: "starting" });
  });

  it("does not start on commit after a pause", () => {
    const { last } = run([
      ...loadA(true),
      { type: "pause" },
      { type: "committed", requestId: "a" },
    ]);

    expect(last.element).toBeUndefined();
  });

  it("calls the element again when play is asked for while playing, and stays playing", () => {
    const { last, lifecycle } = run([
      ...loadA(true),
      report(a, { type: "play", paused: false }),
      { type: "play" },
    ]);

    expect(last.element).toMatchObject({ type: "play", element: a });
    expect(mediaView(lifecycle).isPlaying).toBe(true);
  });

  it("reports started when the element plays and forces a pause when play is not wanted", () => {
    const started = run([...loadA(true), report(a, { type: "play", paused: false })]);
    expect(started.last.emit).toEqual({ type: "started", ...ids });
    expect(mediaView(started.lifecycle).isPlaying).toBe(true);

    const unwanted = run([...loadA(false), report(a, { type: "play", paused: false })]);
    expect(unwanted.last).toEqual({
      lifecycle: unwanted.lifecycle,
      element: { type: "pause", element: a },
    });
    expect(mediaView(unwanted.lifecycle).isPlaying).toBe(false);
  });

  it("ignores a play report from an element that is still paused", () => {
    const { lifecycle } = run(loadA(true));
    expect(mediaTransition(lifecycle, report(a, { type: "play", paused: true }))).toEqual({
      lifecycle,
    });
  });
});

describe("play rejection", () => {
  const rejected = (attempt: number, loadFailed = false) =>
    report(a, { type: "playrejected", attempt, loadFailed });

  it("only accepts the latest attempt", () => {
    const { steps, lifecycle } = run([
      ...loadA(true),
      { type: "committed", requestId: "a" },
      { type: "play" },
      rejected(2),
      rejected(3),
    ]);

    expect(steps.at(-2)!.emit).toBeUndefined();
    expect(steps.at(-1)!.emit).toEqual({ type: "error", reason: "rejected", ...ids });
    expect(playbackOf(lifecycle)).toEqual({ kind: "failed", reason: "rejected" });
  });

  it("drops a rejection disowned by an explicit pause", () => {
    const { last } = run([
      ...loadA(true),
      { type: "committed", requestId: "a" },
      { type: "pause" },
      rejected(2),
    ]);

    expect(last.emit).toBeUndefined();
  });

  it("drops a rejection from before a reload of the same request on the same element", () => {
    const { last } = run([
      ...loadA(true),
      { type: "committed", requestId: "a" },
      { type: "load", request: request("a", true), position: 0 },
      rejected(2),
    ]);

    expect(last.emit).toBeUndefined();
  });

  it("drops a rejection caused by a failed load", () => {
    const { last } = run([
      ...loadA(true),
      { type: "committed", requestId: "a" },
      report(a, { type: "error" }),
      rejected(2, true),
    ]);

    expect(last.emit).toBeUndefined();
  });

  it("still accepts a rejection after the element itself paused", () => {
    const { last } = run([
      ...loadA(true),
      { type: "committed", requestId: "a" },
      report(a, { type: "pause", paused: true, ended: false }),
      rejected(2),
    ]);

    expect(last.emit).toEqual({ type: "error", reason: "rejected", ...ids });
  });
});

describe("pause, end and error", () => {
  it("pauses the attached element on an explicit pause", () => {
    const { last, lifecycle } = run([...loadA(true), { type: "pause" }]);
    expect(last.element).toEqual({ type: "pause", element: a });
    expect(playbackOf(lifecycle)).toEqual({ kind: "paused" });
  });

  it("pauses the previous request's element when pause comes before React commits", () => {
    const { last, lifecycle } = run([
      ...loadA(true),
      { type: "load", request: request("b", true), position: 0 },
      { type: "pause" },
    ]);

    expect(last.element).toEqual({ type: "pause", element: a });
    expect(playbackOf(lifecycle)).toEqual({ kind: "paused" });
  });

  it("reports a plain pause but not the pause at the natural end", () => {
    const playing = run([...loadA(true), report(a, { type: "play", paused: false })]).lifecycle;

    const plain = mediaTransition(
      playing,
      report(a, { type: "pause", paused: true, ended: false }),
    );

    expect(plain.emit).toEqual({ type: "paused", ...ids });
    const atEnd = mediaTransition(playing, report(a, { type: "pause", paused: true, ended: true }));
    expect(atEnd.emit).toBeUndefined();
    expect(mediaView(atEnd.lifecycle).isPlaying).toBe(false);
    expect(
      mediaTransition(playing, report(a, { type: "pause", paused: false, ended: false })),
    ).toEqual({
      lifecycle: playing,
    });
  });

  it("reports ended and stops playing", () => {
    const { last, lifecycle } = run([
      ...loadA(true),
      report(a, { type: "play", paused: false }),
      report(a, { type: "ended" }),
    ]);

    expect(last.emit).toEqual({ type: "ended", ...ids });
    expect(playbackOf(lifecycle)).toEqual({ kind: "paused" });
  });

  it("reports a load error and stays failed through a later pause or end", () => {
    const { steps, lifecycle } = run([
      ...loadA(true),
      report(a, { type: "error" }),
      report(a, { type: "pause", paused: true, ended: false }),
      report(a, { type: "ended" }),
    ]);

    expect(steps[2]!.emit).toEqual({ type: "error", reason: "load", ...ids });
    expect(playbackOf(lifecycle)).toEqual({ kind: "failed", reason: "load" });
  });

  it("retries the element when play is asked for after a failure", () => {
    const { last, lifecycle } = run([
      ...loadA(true),
      report(a, { type: "error" }),
      { type: "play" },
    ]);

    expect(last.element).toMatchObject({ type: "play", element: a });
    expect(playbackOf(lifecycle)).toEqual({ kind: "starting" });
  });
});

describe("seek", () => {
  it("defers the latest seek before metadata and reports it", () => {
    const { steps } = run([...loadA(), seek(19), seek(23)]);
    expect(steps[2]).toMatchObject({ position: { time: 19, report: true } });
    expect(steps[3]).toMatchObject({ position: { time: 23, report: true } });
    expect(steps[3]!.element).toBeUndefined();
  });

  it("applies the deferred seek at metadata, clamped to the duration, without reporting it", () => {
    const { last, lifecycle } = run([
      ...loadA(),
      seek(23),
      report(a, { type: "loadedmetadata", duration: 20 }),
    ]);

    expect(last).toEqual({
      lifecycle,
      element: { type: "seek", element: a, time: 20, report: false },
    });
    expect(
      mediaTransition(
        lifecycle,
        report(a, { type: "seekapplied", currentTime: 20, report: false }),
      ),
    ).toMatchObject({ position: { time: 20, report: false } });
  });

  it("defers a seek before the element attaches and clamps negatives to zero", () => {
    const { last } = run([{ type: "load", request: request("a"), position: 0 }, seek(-4)]);
    expect(last).toMatchObject({ position: { time: 0, report: true } });
    expect(last.element).toBeUndefined();
  });

  it("seeks the element directly after metadata, clamped to the live duration", () => {
    const loaded = run([...loadA(), report(a, { type: "loadedmetadata", duration: 60 })]).lifecycle;
    expect(mediaTransition(loaded, seek(50, 20)).element).toEqual({
      type: "seek",
      element: a,
      time: 20,
      report: true,
    });
    expect(mediaTransition(loaded, seek(-5, 20)).element).toMatchObject({ time: 0 });
    expect(mediaTransition(loaded, seek(500, Infinity)).element).toMatchObject({ time: 500 });
  });

  it("publishes and reports the position the element settled on", () => {
    const loaded = run([...loadA(), report(a, { type: "loadedmetadata", duration: 60 })]).lifecycle;
    expect(
      mediaTransition(loaded, report(a, { type: "seekapplied", currentTime: 8.7972, report: true }))
        .position,
    ).toEqual({ time: 8.7972, report: true });
  });

  it("ignores a non-finite seek", () => {
    const { lifecycle } = run(loadA());

    for (const time of [NaN, Infinity])
      expect(mediaTransition(lifecycle, seek(time))).toEqual({ lifecycle });
  });
});

describe("position and duration", () => {
  it("reports each new whole second once and again after a seek back", () => {
    const { steps } = run([
      ...loadA(),
      report(a, { type: "loadedmetadata", duration: 60 }),
      report(a, { type: "seekapplied", currentTime: 12, report: false }),
      report(a, { type: "timeupdate", currentTime: 12.2 }),
      report(a, { type: "timeupdate", currentTime: 12.7 }),
      report(a, { type: "timeupdate", currentTime: 13.1 }),
      report(a, { type: "seekapplied", currentTime: 5, report: true }),
      report(a, { type: "timeupdate", currentTime: 5.2 }),
    ]);

    expect(steps.slice(3).map((step) => step.position)).toEqual([
      { time: 12, report: false },
      { time: 12.2, report: true },
      { time: 12.7, report: false },
      { time: 13.1, report: true },
      { time: 5, report: true },
      { time: 5.2, report: true },
    ]);
  });

  it("keeps the same lifecycle for a time update within the reported second", () => {
    const { lifecycle } = run([...loadA(), report(a, { type: "timeupdate", currentTime: 12.2 })]);
    expect(
      mediaTransition(lifecycle, report(a, { type: "timeupdate", currentTime: 12.9 })).lifecycle,
    ).toBe(lifecycle);
  });

  it("publishes only finite positive durations", () => {
    const { steps } = run([
      ...loadA(),
      report(a, { type: "durationchange", duration: 20 }),
      report(a, { type: "durationchange", duration: NaN }),
      report(a, { type: "durationchange", duration: Infinity }),
      report(a, { type: "durationchange", duration: 0 }),
    ]);

    expect(steps.slice(2).map((step) => mediaView(step.lifecycle).duration)).toEqual([
      20, 20, 20, 20,
    ]);
  });
});
