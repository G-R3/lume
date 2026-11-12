import { describe, expect, it } from "vite-plus/test";
import {
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

function effects({ element, position, emit }: MediaStep<Audio>) {
  return { element, position, emit };
}

function expectInert(lifecycle: MediaLifecycle<Audio>, event: MediaEvent<Audio>) {
  const step = mediaTransition(lifecycle, event);
  expect(effects(step)).toEqual({});
  expect(mediaView(step.lifecycle)).toEqual(mediaView(lifecycle));
}

function issuedAttempt(step: MediaStep<Audio>) {
  if (step.element?.type !== "play") throw new Error("expected a play call");

  return step.element.attempt;
}

describe("load", () => {
  it("publishes the given position without reporting it and seeks to the request position at metadata", () => {
    const { steps, lifecycle } = run([
      { type: "load", request: request("a"), position: 7 },
      { type: "attach", requestId: "a", element: a },
      report(a, { type: "loadedmetadata", duration: 60 }),
    ]);

    expect(steps[0]!.position).toEqual({ time: 7, report: false });
    expect(mediaView(lifecycle)).toEqual({
      kind: "requested",
      request: request("a"),
      playback: { kind: "paused" },
      duration: 60,
    });
    expect(steps[2]!.element).toEqual({ type: "seek", element: a, time: 12, report: false });
  });

  it("makes play, seek and element reports inert after unloading", () => {
    const { lifecycle } = run([...loadA(true), { type: "load", request: null, position: 19 }]);
    expect(mediaView(lifecycle)).toEqual({ kind: "empty" });

    for (const event of [
      { type: "play" },
      seek(30),
      report(a, { type: "ended" }),
    ] satisfies MediaEvent<Audio>[])
      expectInert(lifecycle, event);
  });

  it("still pauses the outgoing element after unloading", () => {
    const { lifecycle } = run([...loadA(true), { type: "load", request: null, position: 19 }]);
    expect(effects(mediaTransition(lifecycle, { type: "pause" }))).toEqual({
      element: { type: "pause", element: a },
    });
  });

  it("keeps the element when the same request id is loaded again", () => {
    const { lifecycle, last } = run([
      ...loadA(),
      { type: "load", request: request("a", true), position: 0 },
      { type: "play" },
    ]);

    expect(last.element).toMatchObject({ type: "play", element: a });
    expect(mediaTransition(lifecycle, report(a, { type: "ended" })).emit).toEqual({
      type: "ended",
      ...ids,
    });
  });
});

describe("staleness", () => {
  it.each<[string, (attempt: number) => ElementReport]>([
    ["durationchange", () => ({ type: "durationchange", duration: 5 })],
    ["loadedmetadata", () => ({ type: "loadedmetadata", duration: 5 })],
    ["timeupdate", () => ({ type: "timeupdate", currentTime: 4 })],
    ["play", () => ({ type: "play", paused: false })],
    ["pause", () => ({ type: "pause", paused: true, ended: false })],
    ["ended", () => ({ type: "ended" })],
    ["error", () => ({ type: "error" })],
    ["seekapplied", () => ({ type: "seekapplied", currentTime: 4, report: true })],
  ])(
    "ignores %s from the previous request's element before and after React commits",
    (_, value) => {
      const { steps, lifecycle: pending } = run([
        ...loadA(true),
        { type: "committed", requestId: "a" },
        { type: "load", request: request("b"), position: 30 },
      ]);

      const stale = report(a, value(issuedAttempt(steps[2]!)));

      expectInert(pending, stale);

      const committed = run(
        [
          { type: "detach", element: a },
          { type: "attach", requestId: "b", element: b },
        ],
        pending,
      ).lifecycle;

      expectInert(committed, stale);
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
    expectInert(lifecycle, { type: "committed", requestId: "a" });
  });

  it("keeps its element when a different element detaches", () => {
    const { steps } = run([
      ...loadA(true),
      { type: "detach", element: b },
      { type: "committed", requestId: "a" },
    ]);

    expect(effects(steps[2]!)).toEqual({});
    expect(steps[3]!.element).toMatchObject({ type: "play", element: a });
  });

  it("keeps a deferred seek and a pending play through a ref replay", () => {
    const { steps } = run([
      ...loadA(true),
      seek(22),
      { type: "detach", element: a },
      { type: "attach", requestId: "a", element: a },
      { type: "committed", requestId: "a" },
      report(a, { type: "loadedmetadata", duration: 60 }),
    ]);

    expect(steps.slice(3, 5).map(effects)).toEqual([{}, {}]);
    expect(steps[5]!.element).toMatchObject({ type: "play", element: a });
    expect(steps[6]!.element).toEqual({ type: "seek", element: a, time: 22, report: false });
  });
});

describe("play", () => {
  it("starts a requested play once React commits, not when the element attaches", () => {
    const { steps } = run([...loadA(true), { type: "committed", requestId: "a" }]);
    expect(steps[0]!.element).toBeUndefined();
    expect(steps[1]!.element).toBeUndefined();
    expect(steps[2]!.element).toMatchObject({ type: "play", element: a });
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
    expect(playbackOf(lifecycle)).toEqual({ kind: "playing" });
  });

  it("reports started when the element plays and forces a pause when play is not wanted", () => {
    const started = run([...loadA(true), report(a, { type: "play", paused: false })]);
    expect(started.last.emit).toEqual({ type: "started", ...ids });
    expect(playbackOf(started.lifecycle)).toEqual({ kind: "playing" });

    const unwanted = run([...loadA(false), report(a, { type: "play", paused: false })]);
    expect(effects(unwanted.last)).toEqual({ element: { type: "pause", element: a } });
    expect(playbackOf(unwanted.lifecycle)).toEqual({ kind: "paused" });
  });

  it("ignores a play report from an element that is still paused", () => {
    expectInert(run(loadA(true)).lifecycle, report(a, { type: "play", paused: true }));
  });
});

describe("play rejection", () => {
  const rejected = (attempt: number, loadFailed = false): MediaEvent<Audio> => ({
    type: "playrejected",
    attempt,
    loadFailed,
  });

  const committedPlay = (shouldPlay = true) => {
    const { steps, lifecycle } = run([...loadA(shouldPlay), { type: "committed", requestId: "a" }]);

    return { lifecycle, attempt: issuedAttempt(steps[2]!) };
  };

  it("only accepts the latest attempt", () => {
    const first = committedPlay();
    const second = mediaTransition(first.lifecycle, { type: "play" });

    const { steps, lifecycle } = run(
      [rejected(first.attempt), rejected(issuedAttempt(second))],
      second.lifecycle,
    );

    expect(steps[0]!.emit).toBeUndefined();
    expect(steps[1]!.emit).toEqual({ type: "error", reason: "rejected", ...ids });
    expect(playbackOf(lifecycle)).toEqual({ kind: "failed", reason: "rejected" });
  });

  it("drops a rejection disowned by an explicit pause", () => {
    const { lifecycle, attempt } = committedPlay();
    expect(run([{ type: "pause" }, rejected(attempt)], lifecycle).last.emit).toBeUndefined();
  });

  it("drops a rejection from before a reload of the same request on the same element", () => {
    const { lifecycle, attempt } = committedPlay();

    const { last } = run(
      [{ type: "load", request: request("a", true), position: 0 }, rejected(attempt)],
      lifecycle,
    );

    expect(last.emit).toBeUndefined();
  });

  it("drops a rejection caused by a failed load", () => {
    const { lifecycle, attempt } = committedPlay();
    const { last } = run([report(a, { type: "error" }), rejected(attempt, true)], lifecycle);
    expect(last.emit).toBeUndefined();
  });

  it("drops a rejection from a previous request", () => {
    const { lifecycle, attempt } = committedPlay();

    const { last } = run(
      [{ type: "load", request: request("b", true), position: 0 }, rejected(attempt)],
      lifecycle,
    );

    expect(last.emit).toBeUndefined();
  });

  it("still accepts the latest rejection after its element detaches", () => {
    const { lifecycle, attempt } = committedPlay();
    const { last } = run([{ type: "detach", element: a }, rejected(attempt)], lifecycle);
    expect(last.emit).toEqual({ type: "error", reason: "rejected", ...ids });
  });

  it("still accepts a rejection after the element itself paused", () => {
    const { lifecycle, attempt } = committedPlay();

    const { last } = run(
      [report(a, { type: "pause", paused: true, ended: false }), rejected(attempt)],
      lifecycle,
    );

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
    expect(playbackOf(atEnd.lifecycle)).toEqual({ kind: "paused" });
    expectInert(playing, report(a, { type: "pause", paused: false, ended: false }));
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

    expect(effects(last)).toEqual({
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
      mediaTransition(
        loaded,
        report(a, { type: "seekapplied", currentTime: 3.123456, report: true }),
      ).position,
    ).toEqual({ time: 3.123456, report: true });
  });

  it("ignores a non-finite seek", () => {
    const { lifecycle } = run(loadA());

    for (const time of [NaN, Infinity]) expectInert(lifecycle, seek(time));
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

  it("publishes only finite positive durations", () => {
    const { steps } = run([
      ...loadA(),
      report(a, { type: "durationchange", duration: 20 }),
      report(a, { type: "durationchange", duration: NaN }),
      report(a, { type: "durationchange", duration: Infinity }),
      report(a, { type: "durationchange", duration: 0 }),
    ]);

    expect(
      steps.slice(2).map((step) => {
        const view = mediaView(step.lifecycle);

        return view.kind === "requested" ? view.duration : null;
      }),
    ).toEqual([20, 20, 20, 20]);
  });
});
