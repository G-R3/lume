// @vitest-environment happy-dom

import { Storage } from "happy-dom";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vite-plus/test";
import type { MediaView } from "@/lib/media-lifecycle";
import type { AudioEvent, PlaybackRequest } from "@/lib/playback-media";
import { useMediaElement } from "./use-media-element";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", new Storage());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function request(id: string, shouldPlay = false): PlaybackRequest {
  return {
    requestId: id,
    queueItemId: "same-item",
    url: `file:///${id}.wav`,
    shouldPlay,
    position: 12,
    durationHint: 60,
  };
}

const playbackOf = (view: MediaView) => (view.kind === "requested" ? view.playback : null);

const durationOf = (view: MediaView) => (view.kind === "requested" ? view.duration : 0);

function mountMedia(strict = false, onRender = () => {}) {
  const attempts: ((error: DOMException) => void)[] = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => {
    return new Promise<void>((_resolve, reject) => attempts.push(reject));
  });
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const events: AudioEvent[] = [];
  const positions: number[] = [];
  const container = document.createElement("div");
  const root = createRoot(container);
  let current: ReturnType<typeof useMediaElement> | null = null;

  const callbacks = {
    onEvent: (event: AudioEvent) => {
      events.push(event);
    },
    onPosition: (position: number) => {
      positions.push(position);
    },
  };

  function Probe() {
    onRender();
    current = useMediaElement(callbacks);

    return current.element;
  }

  act(() =>
    root.render(
      strict ? (
        <StrictMode>
          <Probe />
        </StrictMode>
      ) : (
        <Probe />
      ),
    ),
  );
  let mounted = true;

  const unmount = () => {
    if (mounted) act(() => root.unmount());
    mounted = false;
  };

  onTestFinished(unmount);

  return {
    get media() {
      if (!current) throw new Error("Media probe did not render");

      return current;
    },
    get audio() {
      const audio = container.querySelector("audio");

      if (!audio) throw new Error("No audio element mounted");

      return audio;
    },
    attempts,
    pause,
    unmount,
    events,
    positions,
    callbacks,
  };
}

function emit(audio: HTMLAudioElement, type: string, values = {}) {
  Object.entries(values).forEach(([key, value]) =>
    Object.defineProperty(audio, key, { configurable: true, value, writable: true }),
  );
  act(() => {
    audio.dispatchEvent(new Event(type));
  });
}

it("defers the latest seek until metadata and then clamps and reports direct seeks", () => {
  const probe = mountMedia();
  act(() => {
    probe.media.load(request("a"));
    probe.media.seek(19);
    probe.media.seek(23);
  });
  expect(probe.media.getPosition()).toBe(23);
  expect(probe.positions).toEqual([19, 23]);
  emit(probe.audio, "loadedmetadata", { duration: 20 });
  expect(probe.audio.currentTime).toBe(20);
  expect(probe.media.getPosition()).toBe(20);
  expect(probe.positions).toEqual([19, 23]);
  act(() => probe.media.seek(5));
  emit(probe.audio, "timeupdate", { currentTime: 5.2 });
  emit(probe.audio, "timeupdate", { currentTime: 5.8 });
  expect(probe.positions).toEqual([19, 23, 5, 5.2]);
});

it("only accepts the latest play rejection and explicit pause supersedes it", async () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  act(() => probe.media.play());
  await act(async () => probe.attempts[0]!(new DOMException("old")));
  expect(probe.events).toEqual([]);
  await act(async () => probe.attempts[1]!(new DOMException("latest")));
  expect(probe.events).toEqual([
    { type: "error", requestId: "a", queueItemId: "same-item", reason: "rejected" },
  ]);
  act(() => probe.media.play());
  act(() => probe.media.pause());
  await act(async () => probe.attempts[2]!(new DOMException("paused")));
  expect(probe.events).toHaveLength(1);
  emit(probe.audio, "play", { paused: false });
  expect(playbackOf(probe.media.view)).toEqual({ kind: "paused" });
  expect(probe.pause).toHaveBeenCalledTimes(2);
});

it.each(["durationchange", "loadedmetadata", "timeupdate", "ended", "error", "play", "pause"])(
  "ignores stale %s between a synchronous load and React commit",
  (type) => {
    const probe = mountMedia();
    act(() => probe.media.load(request("a", true)));
    const old = probe.audio;
    Object.defineProperties(old, {
      duration: { configurable: true, value: 5 },
      paused: { configurable: true, value: type !== "play" },
      currentTime: { configurable: true, value: 4, writable: true },
    });
    act(() => {
      probe.media.load({ ...request("b"), position: 30, durationHint: 90 });
      old.dispatchEvent(new Event(type));
    });
    expect(probe.events).toEqual([]);
    expect(probe.positions).toEqual([]);
    expect(probe.pause).not.toHaveBeenCalled();
    expect(probe.media.getPosition()).toBe(30);
    expect(durationOf(probe.media.view)).toBe(90);
    expect(playbackOf(probe.media.view)).toEqual({ kind: "paused" });
    emit(probe.audio, "loadedmetadata", { duration: 100 });
    expect(probe.audio.currentTime).toBe(30);
  },
);

it("supersedes play rejection when reloading the same queue item", async () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  act(() => probe.media.load({ ...request("b", true), position: 30 }));
  await act(async () => probe.attempts[0]!(new DOMException("stale")));
  expect(probe.events).toEqual([]);
  expect(probe.media.getPosition()).toBe(30);
  emit(probe.audio, "play", { paused: false });
  expect(probe.events).toEqual([{ type: "started", requestId: "b", queueItemId: "same-item" }]);
});

it("preserves separate load positions and an unavailable track position", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a"), 7));
  expect(probe.media.getPosition()).toBe(7);
  emit(probe.audio, "loadedmetadata", { duration: 60 });
  expect(probe.media.getPosition()).toBe(12);
  act(() => {
    probe.media.load(null, 19);
    probe.media.play();
    probe.media.seek(30);
  });
  expect(probe.media.element).toBeNull();
  expect(probe.media.getPosition()).toBe(19);
  act(() => probe.media.load(request("b")));
  expect(probe.attempts).toHaveLength(0);
});

it("keeps precommit pause and volume ref attachment from restarting playback", () => {
  const probe = mountMedia();
  act(() => {
    probe.media.load(request("a", true));
    probe.media.pause();
  });
  expect(probe.attempts).toHaveLength(0);
  act(() => probe.media.play());
  act(() => probe.media.setVolume(0.4));
  expect(probe.audio.volume).toBe(0.4);
  expect(probe.attempts).toHaveLength(1);
  emit(probe.audio, "play", { paused: false });
  expect(playbackOf(probe.media.view)).toEqual({ kind: "playing" });
  expect(probe.events).toEqual([{ type: "started", requestId: "a", queueItemId: "same-item" }]);
});

it.each(["play", "ended", "error"])(
  "allows a synchronous replacement from a %s callback",
  (type) => {
    const probe = mountMedia();
    probe.callbacks.onEvent = (event) => {
      probe.events.push(event);
      probe.media.load({ ...request("b"), position: 30 });
    };

    act(() => probe.media.load(request("a", true)));
    emit(probe.audio, type, { paused: false });
    expect(probe.events).toHaveLength(1);
    expect(probe.events[0]?.requestId).toBe("a");
    expect(probe.audio.src).toBe("file:///b.wav");
    expect(probe.media.getPosition()).toBe(30);
    expect(playbackOf(probe.media.view)).toEqual({ kind: "paused" });
  },
);

it("retains deferred seek and playback ownership through StrictMode ref replay", async () => {
  const probe = mountMedia(true);
  act(() => probe.media.load(request("a", true)));
  act(() => probe.media.seek(22));
  act(() => probe.media.setVolume(0.3));
  emit(probe.audio, "loadedmetadata", { duration: 50 });
  expect(probe.audio.currentTime).toBe(22);
  expect(probe.audio.volume).toBe(0.3);
  act(() => probe.media.pause());
  await act(async () => probe.attempts.forEach((reject) => reject(new DOMException("superseded"))));
  expect(probe.events).toEqual([]);
  act(() => probe.media.play());
  emit(probe.audio, "play", { paused: false });
  expect(playbackOf(probe.media.view)).toEqual({ kind: "playing" });
  expect(probe.events).toEqual([{ type: "started", requestId: "a", queueItemId: "same-item" }]);
});

it("publishes finite durations and reads live duration when seeking", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a")));
  emit(probe.audio, "durationchange", { duration: 20 });
  expect(durationOf(probe.media.view)).toBe(20);
  [NaN, Infinity, 0].forEach((duration) => {
    emit(probe.audio, "durationchange", { duration });
    expect(durationOf(probe.media.view)).toBe(20);
  });
  emit(probe.audio, "loadedmetadata", { duration: Infinity });
  act(() => probe.media.seek(500));
  expect(probe.audio.currentTime).toBe(500);
  act(() => probe.media.seek(-5));
  expect(probe.audio.currentTime).toBe(0);
  act(() => {
    probe.media.seek(NaN);
    probe.media.seek(Infinity);
  });
  expect(probe.media.getPosition()).toBe(0);
});

it("distinguishes pause at natural end from a plain pause and reports media errors", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  emit(probe.audio, "play", { paused: false });
  emit(probe.audio, "pause", { paused: true, ended: true });
  expect(playbackOf(probe.media.view)).toEqual({ kind: "paused" });
  emit(probe.audio, "ended");
  expect(probe.events.map((event) => event.type)).toEqual(["started", "ended"]);
  act(() => probe.media.play());
  emit(probe.audio, "pause", { paused: true, ended: false });
  emit(probe.audio, "error", { error: { code: 4 } });
  expect(probe.events.slice(2)).toEqual([
    { type: "paused", requestId: "a", queueItemId: "same-item" },
    { type: "error", requestId: "a", queueItemId: "same-item", reason: "load" },
  ]);
});

it("reports a failed load once, without a second error from its play rejection", async () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  emit(probe.audio, "error", { error: { code: 4 } });
  await act(async () =>
    probe.attempts[0]!(new DOMException("The element has no supported sources.")),
  );

  expect(probe.events).toEqual([
    { type: "error", requestId: "a", queueItemId: "same-item", reason: "load" },
  ]);
  expect(playbackOf(probe.media.view)).toEqual({ kind: "failed", reason: "load" });
});

it("still reports a play rejection that follows an element pause", async () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  emit(probe.audio, "pause", { paused: true, ended: false });
  await act(async () => probe.attempts[0]!(new DOMException("aborted by pause")));
  expect(probe.events).toEqual([
    { type: "paused", requestId: "a", queueItemId: "same-item" },
    { type: "error", requestId: "a", queueItemId: "same-item", reason: "rejected" },
  ]);
});

it("pauses the old element when pause arrives between a synchronous load and React commit", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  const old = probe.audio;
  act(() => {
    probe.media.load(request("b", true));
    probe.media.pause();
  });
  expect(probe.pause.mock.contexts).toEqual([old]);
  expect(probe.attempts).toHaveLength(1);
});

it("allows a synchronous replacement from a paused callback", () => {
  const probe = mountMedia();
  probe.callbacks.onEvent = (event) => {
    probe.events.push(event);
    probe.media.load({ ...request("b"), position: 30 });
  };

  act(() => probe.media.load(request("a", true)));
  emit(probe.audio, "pause", { paused: true, ended: false });
  expect(probe.events).toEqual([{ type: "paused", requestId: "a", queueItemId: "same-item" }]);
  expect(probe.audio.src).toBe("file:///b.wav");
  expect(probe.media.getPosition()).toBe(30);
});

it("does not rerender for attachment, deferred seeks, or time updates within a second", () => {
  let renders = 0;
  const probe = mountMedia(false, () => renders++);
  act(() => probe.media.load(request("a")));
  const settled = renders;
  act(() => probe.media.seek(3));
  emit(probe.audio, "loadedmetadata", { duration: 60 });
  expect(probe.audio.currentTime).toBe(3);
  emit(probe.audio, "timeupdate", { currentTime: 12.1 });
  emit(probe.audio, "timeupdate", { currentTime: 12.6 });
  expect(probe.positions).toEqual([3, 12.1]);
  expect(probe.media.getPosition()).toBe(12.6);
  expect(renders).toBe(settled);
  act(() => probe.media.setVolume(0.5));
  expect(renders).toBe(settled + 1);
});

it("still reports a play rejection that settles after the hook unmounts", async () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  probe.unmount();
  await act(async () => probe.attempts[0]!(new DOMException("aborted")));
  expect(probe.events).toEqual([
    { type: "error", requestId: "a", queueItemId: "same-item", reason: "rejected" },
  ]);
});

it("publishes the starting view on load, before the element reports anything", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  expect(probe.events).toEqual([]);
  expect(probe.media.view).toEqual({
    kind: "requested",
    request: request("a", true),
    playback: { kind: "starting" },
    duration: 60,
  });
});

it("publishes a retried load of a failed queue item as starting again", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a", true)));
  emit(probe.audio, "error", { error: { code: 4 } });
  expect(playbackOf(probe.media.view)).toEqual({ kind: "failed", reason: "load" });
  act(() => probe.media.load(request("b", true)));
  expect(probe.media.view).toMatchObject({
    kind: "requested",
    request: { requestId: "b", queueItemId: "same-item" },
    playback: { kind: "starting" },
  });
});
