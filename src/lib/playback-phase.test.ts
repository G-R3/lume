import { describe, expect, it } from "vite-plus/test";
import { queueContext } from "../../tests/helpers/queue-context";
import type { MediaView, Playback } from "./media-lifecycle";
import {
  derivePlaybackPhase,
  pausesOnToggle,
  type FailedTrack,
  type PlaybackPhase,
} from "./playback-phase";
import type { QueueState } from "./queue/model";
import { selectCurrentItem } from "./queue/selectors";
import { transition } from "./queue/transition";
import { defaultSort } from "./track-sort";

const context = queueContext([1]);

function startQueue(paused: boolean) {
  return transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      filter: null,
      source: { kind: "all-tracks" },
      entries: [{ sourceEntryId: 1, trackId: 1 }],
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
      paused,
    },
    context,
  );
}

const playingQueue = startQueue(false);

const queues = {
  "no queue": null,
  "stopped queue": transition(playingQueue, { type: "next" }, context),
  "playing queue": playingQueue,
  "paused queue": startQueue(true),
} satisfies Record<string, QueueState | null>;

const currentId = selectCurrentItem(playingQueue)!.queueItemId;

function requested(queueItemId: string, playback: Playback): MediaView {
  return {
    kind: "requested",
    request: {
      requestId: `request-${queueItemId}`,
      queueItemId,
      url: "file:///a.wav",
      shouldPlay: false,
      position: 0,
      durationHint: 60,
    },
    playback,
    duration: 60,
  };
}

const stale = (playback: Playback) => requested("another-item", playback);

const matching = (playback: Playback) => requested(currentId, playback);

type Scenario = { view: MediaView; availableTrackIds: ReadonlySet<number> };

const trackAvailable = (view: MediaView): Scenario => ({ view, availableTrackIds: new Set([1]) });

const trackUnavailable = (view: MediaView): Scenario => ({ view, availableTrackIds: new Set() });

const scenarios = {
  empty: trackAvailable({ kind: "empty" }),
  "stale paused": trackAvailable(stale({ kind: "paused" })),
  "stale starting": trackAvailable(stale({ kind: "starting" })),
  "stale playing": trackAvailable(stale({ kind: "playing" })),
  "stale failed load": trackAvailable(stale({ kind: "failed", reason: "load" })),
  "stale failed rejected": trackAvailable(stale({ kind: "failed", reason: "rejected" })),
  "matching paused": trackAvailable(matching({ kind: "paused" })),
  "matching starting": trackAvailable(matching({ kind: "starting" })),
  "matching playing": trackAvailable(matching({ kind: "playing" })),
  "matching failed load": trackAvailable(matching({ kind: "failed", reason: "load" })),
  "matching failed rejected": trackAvailable(matching({ kind: "failed", reason: "rejected" })),
  "empty, track unavailable": trackUnavailable({ kind: "empty" }),
  "stale paused, track unavailable": trackUnavailable(stale({ kind: "paused" })),
  "stale starting, track unavailable": trackUnavailable(stale({ kind: "starting" })),
  "stale playing, track unavailable": trackUnavailable(stale({ kind: "playing" })),
  "stale failed load, track unavailable": trackUnavailable(
    stale({ kind: "failed", reason: "load" }),
  ),
  "stale failed rejected, track unavailable": trackUnavailable(
    stale({ kind: "failed", reason: "rejected" }),
  ),
  "matching paused, track unavailable": trackUnavailable(matching({ kind: "paused" })),
  "matching starting, track unavailable": trackUnavailable(matching({ kind: "starting" })),
  "matching playing, track unavailable": trackUnavailable(matching({ kind: "playing" })),
  "matching failed load, track unavailable": trackUnavailable(
    matching({ kind: "failed", reason: "load" }),
  ),
  "matching failed rejected, track unavailable": trackUnavailable(
    matching({ kind: "failed", reason: "rejected" }),
  ),
} satisfies Record<string, Scenario>;

type ScenarioName = keyof typeof scenarios;

const stopped: PlaybackPhase = { kind: "stopped" };

const loading: PlaybackPhase = { kind: "loading" };

const playing: PlaybackPhase = { kind: "playing" };

const paused: PlaybackPhase = { kind: "paused" };

const unavailable: PlaybackPhase = { kind: "failed", reason: { kind: "unavailable" } };

const failedLoad: PlaybackPhase = { kind: "failed", reason: { kind: "load", file: "checking" } };

const rejected: PlaybackPhase = { kind: "failed", reason: { kind: "rejected" } };

const allStopped = {
  empty: stopped,
  "stale paused": stopped,
  "stale starting": stopped,
  "stale playing": stopped,
  "stale failed load": stopped,
  "stale failed rejected": stopped,
  "matching paused": stopped,
  "matching starting": stopped,
  "matching playing": stopped,
  "matching failed load": stopped,
  "matching failed rejected": stopped,
  "empty, track unavailable": stopped,
  "stale paused, track unavailable": stopped,
  "stale starting, track unavailable": stopped,
  "stale playing, track unavailable": stopped,
  "stale failed load, track unavailable": stopped,
  "stale failed rejected, track unavailable": stopped,
  "matching paused, track unavailable": stopped,
  "matching starting, track unavailable": stopped,
  "matching playing, track unavailable": stopped,
  "matching failed load, track unavailable": stopped,
  "matching failed rejected, track unavailable": stopped,
} satisfies Record<ScenarioName, PlaybackPhase>;

const expected = {
  "no queue": allStopped,
  "stopped queue": allStopped,
  "playing queue": {
    empty: loading,
    "stale paused": loading,
    "stale starting": loading,
    "stale playing": loading,
    "stale failed load": loading,
    "stale failed rejected": loading,
    "matching paused": paused,
    "matching starting": loading,
    "matching playing": playing,
    "matching failed load": failedLoad,
    "matching failed rejected": rejected,
    "empty, track unavailable": unavailable,
    "stale paused, track unavailable": unavailable,
    "stale starting, track unavailable": unavailable,
    "stale playing, track unavailable": unavailable,
    "stale failed load, track unavailable": unavailable,
    "stale failed rejected, track unavailable": unavailable,
    "matching paused, track unavailable": paused,
    "matching starting, track unavailable": loading,
    "matching playing, track unavailable": playing,
    "matching failed load, track unavailable": failedLoad,
    "matching failed rejected, track unavailable": rejected,
  },
  "paused queue": {
    empty: paused,
    "stale paused": paused,
    "stale starting": paused,
    "stale playing": paused,
    "stale failed load": paused,
    "stale failed rejected": paused,
    "matching paused": paused,
    "matching starting": loading,
    "matching playing": playing,
    "matching failed load": failedLoad,
    "matching failed rejected": rejected,
    "empty, track unavailable": unavailable,
    "stale paused, track unavailable": unavailable,
    "stale starting, track unavailable": unavailable,
    "stale playing, track unavailable": unavailable,
    "stale failed load, track unavailable": unavailable,
    "stale failed rejected, track unavailable": unavailable,
    "matching paused, track unavailable": paused,
    "matching starting, track unavailable": loading,
    "matching playing, track unavailable": playing,
    "matching failed load, track unavailable": failedLoad,
    "matching failed rejected, track unavailable": rejected,
  },
} satisfies Record<keyof typeof queues, Record<ScenarioName, PlaybackPhase>>;

describe("derivePlaybackPhase", () => {
  const queueByName = new Map<string, QueueState | null>(Object.entries(queues));
  const scenarioByName = new Map<string, Scenario>(Object.entries(scenarios));

  const cases = Object.entries(expected).flatMap(([queueName, row]) =>
    Object.entries(row).map(([scenarioName, phase]) => ({
      queueName,
      scenarioName,
      queue: queueByName.get(queueName) ?? null,
      ...scenarioByName.get(scenarioName)!,
      phase,
    })),
  );

  it.each(cases)("$queueName with $scenarioName", ({ queue, view, availableTrackIds, phase }) => {
    expect(derivePlaybackPhase(queue, view, availableTrackIds, null)).toEqual(phase);
  });
});

describe("a failed load's file check", () => {
  const failedLoadView = matching({ kind: "failed", reason: "load" });

  const loadRecord = (requestId: string, file: "missing" | "unreadable"): FailedTrack => ({
    kind: "load",
    trackId: 1,
    queueItemId: currentId,
    requestId,
    file,
  });

  it.each([
    ["missing for this request", loadRecord(`request-${currentId}`, "missing"), "missing"],
    ["unreadable for this request", loadRecord(`request-${currentId}`, "unreadable"), "unreadable"],
    ["for another request", loadRecord("an-earlier-request", "missing"), "checking"],
    [
      "an unavailable skip",
      { kind: "unavailable", trackId: 1, queueItemId: currentId } satisfies FailedTrack,
      "checking",
    ],
  ] as const)("reports %s", (_name, failedTrack, file) => {
    expect(derivePlaybackPhase(playingQueue, failedLoadView, new Set([1]), failedTrack)).toEqual({
      kind: "failed",
      reason: { kind: "load", file },
    });
  });

  it("does not change a rejection", () => {
    expect(
      derivePlaybackPhase(
        playingQueue,
        matching({ kind: "failed", reason: "rejected" }),
        new Set([1]),
        loadRecord(`request-${currentId}`, "missing"),
      ),
    ).toEqual(rejected);
  });
});

it.each([
  [stopped, false],
  [loading, true],
  [playing, true],
  [paused, false],
  [failedLoad, false],
  [rejected, false],
  [unavailable, false],
] as const)("pausesOnToggle(%o) is %s", (phase, pauses) => {
  expect(pausesOnToggle(phase)).toBe(pauses);
});
