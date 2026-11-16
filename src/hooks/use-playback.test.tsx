// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Storage } from "happy-dom";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vite-plus/test";
import type { MusicLibrary, SavedPlaybackSession, Track } from "../../shared/lib";
import { queueContext } from "../../tests/helpers/queue-context";
import { serializeQueueSession } from "@/lib/queue/persistence";
import { transition } from "@/lib/queue/transition";
import { defaultSort } from "@/lib/track-sort";
import { PlaybackProvider, usePlayback } from "./use-playback";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", new Storage());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => new Promise(() => {}));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const availableLibrary: MusicLibrary = {
  kind: "library",
  playlists: [],
  sources: [],
  tracks: [track(1), track(2)],
};

function pausedSessionOnFirstTrack(): SavedPlaybackSession {
  const queue = transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      filter: null,
      source: { kind: "all-tracks" },
      entries: [
        { sourceEntryId: 1, trackId: 1 },
        { sourceEntryId: 2, trackId: 2 },
      ],
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
      paused: true,
    },
    queueContext([1, 2]),
  );

  if (!queue) throw new Error("Expected a queue");

  return { payload: serializeQueueSession(queue), position: 0 };
}

async function mountRestoredPlayback(library = availableLibrary) {
  vi.stubGlobal("lume", {
    hasTrackFile: () => Promise.resolve(true),
    playbackSession: {
      flush: () => {},
      load: () => Promise.resolve(pausedSessionOnFirstTrack()),
      save: () => Promise.resolve(),
      savePosition: () => Promise.resolve(),
    },
  });

  const commits: string[] = [];
  const container = document.createElement("div");
  const root = createRoot(container);
  let latest: ReturnType<typeof usePlayback> | null = null;

  function Probe() {
    const playback = usePlayback();
    latest = playback;
    const commit = `${playback.activeTrack?.id ?? "none"}:${playback.phase.kind}`;

    useLayoutEffect(() => {
      if (commits.at(-1) !== commit) commits.push(commit);
    });

    return null;
  }

  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PlaybackProvider>
          <Probe />
        </PlaybackProvider>
      </QueryClientProvider>,
    ),
  );
  onTestFinished(() => act(() => root.unmount()));

  const playback = () => {
    if (!latest) throw new Error("Playback probe did not render");

    return latest;
  };

  act(() => playback().syncLibrary(library));
  await act(() => new Promise((resolve) => setTimeout(resolve)));

  return {
    commits,
    playback,
    toggle: () => act(() => playback().togglePlayback()),
    emit: (type: string, values = {}) => {
      const audio = container.querySelector("audio");

      if (!audio) throw new Error("No audio element mounted");
      Object.entries(values).forEach(([key, value]) =>
        Object.defineProperty(audio, key, { configurable: true, value, writable: true }),
      );
      act(() => {
        audio.dispatchEvent(new Event(type));
      });
    },
  };
}

it("restores a paused session as paused, never failed while its audio is on the way", async () => {
  const probe = await mountRestoredPlayback();
  expect(probe.commits).toEqual(["none:stopped", "1:paused"]);
});

it("restores a paused session on an unavailable track as failed unavailable", async () => {
  const probe = await mountRestoredPlayback({
    ...availableLibrary,
    tracks: [{ ...track(1), available: false }, track(2)],
  });

  expect(probe.commits).toEqual(["none:stopped", "1:failed"]);
  expect(probe.playback().phase).toEqual({ kind: "failed", reason: "unavailable" });
});

it("shows loading from Play until the element plays, and loading the next track when one ends", async () => {
  const probe = await mountRestoredPlayback();
  probe.commits.length = 0;

  probe.toggle();
  probe.emit("play", { paused: false });
  probe.emit("ended");
  expect(probe.commits).toEqual(["1:loading", "1:playing", "2:loading"]);
});

it("pauses a loading track on toggle and follows a pause the app did not request", async () => {
  const probe = await mountRestoredPlayback();
  probe.commits.length = 0;

  probe.toggle();
  probe.toggle();
  probe.toggle();
  probe.emit("play", { paused: false });
  probe.emit("pause", { paused: true, ended: false });
  expect(probe.commits).toEqual(["1:loading", "1:paused", "1:loading", "1:playing", "1:paused"]);
});

it("shows a load failure as failed, then loading again on the next toggle", async () => {
  const probe = await mountRestoredPlayback();
  probe.commits.length = 0;

  probe.toggle();
  probe.emit("error", { error: { code: 4 } });
  expect(probe.playback().phase).toEqual({ kind: "failed", reason: "load" });
  probe.toggle();
  expect(probe.commits).toEqual(["1:loading", "1:failed", "1:loading"]);
});

function track(id: number): Track {
  return {
    addedAt: 0,
    album: "Album",
    albumArtists: [],
    artists: [],
    artworkUrl: null,
    available: true,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "wav",
    genres: [],
    id,
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: String(id),
    trackNumber: null,
    trackTotal: null,
    unavailableReason: null,
    url: `lume://track/${id}`,
    year: null,
  };
}
