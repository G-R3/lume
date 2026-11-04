// @vitest-environment happy-dom

import { Storage } from "happy-dom";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vite-plus/test";
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

function mountMedia(strict = false) {
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
  onTestFinished(() => act(() => root.unmount()));

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
    { type: "error", requestId: "a", queueItemId: "same-item", source: "play", message: "latest" },
  ]);
  act(() => probe.media.play());
  act(() => probe.media.pause());
  await act(async () => probe.attempts[2]!(new DOMException("paused")));
  expect(probe.events).toHaveLength(1);
  emit(probe.audio, "play", { paused: false });
  expect(probe.media.isPlaying).toBe(false);
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
    expect(probe.media.duration).toBe(90);
    expect(probe.media.isPlaying).toBe(false);
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
    expect(probe.media.hasRequest()).toBe(false);
    probe.media.play();
    probe.media.seek(30);
  });
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
  expect(probe.media.isPlaying).toBe(true);
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
    expect(probe.media.hasRequest()).toBe(true);
    expect(probe.media.isPlaying).toBe(false);
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
  expect(probe.media.isPlaying).toBe(true);
  expect(probe.events).toEqual([{ type: "started", requestId: "a", queueItemId: "same-item" }]);
});

it("publishes finite durations and reads live duration when seeking", () => {
  const probe = mountMedia();
  act(() => probe.media.load(request("a")));
  emit(probe.audio, "durationchange", { duration: 20 });
  expect(probe.media.duration).toBe(20);
  [NaN, Infinity, 0].forEach((duration) => {
    emit(probe.audio, "durationchange", { duration });
    expect(probe.media.duration).toBe(20);
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
  expect(probe.media.isPlaying).toBe(false);
  emit(probe.audio, "ended");
  expect(probe.events.map((event) => event.type)).toEqual(["started", "ended"]);
  act(() => probe.media.play());
  emit(probe.audio, "pause", { paused: true, ended: false });
  emit(probe.audio, "error", { error: { message: "Unreadable file" } });
  expect(probe.events.slice(2)).toEqual([
    { type: "paused", requestId: "a", queueItemId: "same-item" },
    {
      type: "error",
      requestId: "a",
      queueItemId: "same-item",
      message: "Unreadable file",
      source: "media",
    },
  ]);
});
