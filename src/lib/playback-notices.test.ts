import { describe, expect, it } from "vite-plus/test";
import { queueContext } from "../../tests/helpers/queue-context";
import { noFailures, type PlaybackFailures } from "./playback-controller";
import {
  derivePlaybackNotices,
  formatPlaybackNotice,
  type PlaybackNotice,
} from "./playback-notices";
import type { PlaybackPhase } from "./playback-phase";
import type { SessionSource } from "./queue/commands";
import { selectCurrentItem } from "./queue/selectors";
import { transition } from "./queue/transition";
import { defaultSort } from "./track-sort";

const tracksById = new Map([
  [1, { title: "Alpha" }],
  [2, { title: "Beta" }],
]);

function startQueue(source: SessionSource["source"]) {
  return transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      filter: null,
      source,
      entries: [
        { sourceEntryId: 1, trackId: 1 },
        { sourceEntryId: 2, trackId: 2 },
      ],
      start: { kind: "entry", sourceEntryId: 2 },
      shuffled: false,
      sessionId: "session",
      paused: false,
    },
    queueContext([1, 2]),
  );
}

const queue = startQueue({ kind: "all-tracks" });

const playlistQueue = startQueue({ kind: "playlist", playlistId: 1, title: "Road Trip" });

const currentItemId = selectCurrentItem(queue)!.queueItemId;

const playing: PlaybackPhase = { kind: "playing" };

function notices(
  failures: Partial<PlaybackFailures>,
  phase: PlaybackPhase = playing,
  forQueue = queue,
) {
  return derivePlaybackNotices({
    queue: forQueue,
    tracksById,
    failures: { ...noFailures, ...failures },
    phase,
  });
}

const skippedLoad = {
  kind: "load",
  trackId: 1,
  queueItemId: "skipped-item",
  requestId: "skipped-request",
  file: "missing",
} as const;

describe("derivePlaybackNotices", () => {
  it("shows nothing when nothing failed", () => {
    expect(notices({})).toEqual([]);
  });

  it("describes the current track's failure from the phase", () => {
    expect(notices({}, { kind: "failed", reason: { kind: "rejected" } })).toEqual([
      { kind: "track", title: "Beta", failure: { kind: "rejected" } },
    ]);
  });

  it("describes a skipped track that failed to load, with its file check", () => {
    expect(notices({ track: skippedLoad })).toEqual([
      { kind: "track", title: "Alpha", failure: { kind: "load", file: "missing" } },
    ]);
  });

  it("describes a track skipped as unavailable", () => {
    expect(
      notices({ track: { kind: "unavailable", trackId: 1, queueItemId: "skipped-item" } }),
    ).toEqual([{ kind: "track", title: "Alpha", failure: { kind: "unavailable" } }]);
  });

  it("prefers the current track's failure over a skipped one", () => {
    expect(
      notices({ track: skippedLoad }, { kind: "failed", reason: { kind: "unavailable" } }),
    ).toEqual([{ kind: "track", title: "Beta", failure: { kind: "unavailable" } }]);
  });

  it("shows nothing for a record of the current item once it plays again", () => {
    expect(notices({ track: { ...skippedLoad, trackId: 2, queueItemId: currentItemId } })).toEqual(
      [],
    );
  });

  it("orders track, source reload, restore, then save", () => {
    expect(
      notices(
        { track: skippedLoad, sourceReload: true, restore: true, save: true },
        playing,
        playlistQueue,
      ).map((notice) => notice.kind),
    ).toEqual(["track", "source-reload", "restore", "save"]);
  });

  it("names the playlist that failed to reload", () => {
    expect(notices({ sourceReload: true }, playing, playlistQueue)).toEqual([
      { kind: "source-reload", playlistTitle: "Road Trip" },
    ]);
  });

  it("shows only the restore failure when there is no queue", () => {
    expect(
      derivePlaybackNotices({
        queue: null,
        tracksById,
        failures: { ...noFailures, restore: true },
        phase: { kind: "stopped" },
      }),
    ).toEqual([{ kind: "restore" }]);
  });
});

describe("formatPlaybackNotice", () => {
  it.each<[PlaybackNotice, string]>([
    [
      { kind: "track", title: "Alpha", failure: { kind: "load", file: "checking" } },
      "Could not play Alpha.",
    ],
    [
      { kind: "track", title: "Alpha", failure: { kind: "load", file: "missing" } },
      "Could not play Alpha. Its file was moved, deleted, or disconnected.",
    ],
    [
      { kind: "track", title: "Alpha", failure: { kind: "load", file: "unreadable" } },
      "Could not play Alpha. The file can’t be read or is in a format Lume can’t play.",
    ],
    [
      { kind: "track", title: "Alpha", failure: { kind: "rejected" } },
      "Could not play Alpha. Press Play to try again.",
    ],
    [
      { kind: "track", title: "Alpha", failure: { kind: "unavailable" } },
      "Could not play Alpha. It’s unavailable. Check its folder in Settings.",
    ],
    [
      { kind: "track", title: null, failure: { kind: "rejected" } },
      "Could not play this track. Press Play to try again.",
    ],
    [
      { kind: "source-reload", playlistTitle: "Road Trip" },
      "Could not reload Road Trip. Press Play to try again.",
    ],
    [
      { kind: "source-reload", playlistTitle: null },
      "Could not reload the playlist. Press Play to try again.",
    ],
    [{ kind: "restore" }, "Could not restore your last queue."],
    [
      { kind: "save" },
      "Could not save playback. Your queue and position might not be there next time.",
    ],
  ])("formats %o", (notice, copy) => {
    expect(formatPlaybackNotice(notice)).toBe(copy);
  });
});
