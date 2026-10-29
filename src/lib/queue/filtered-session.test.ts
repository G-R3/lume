import { describe, expect, it } from "vite-plus/test";
import type { MusicLibrary } from "../../../shared/lib";
import type { PlayableSource, QueueRandom } from "./commands";
import type { QueueState } from "./model";
import { parseQueueSession, serializeQueueSession } from "./persistence";
import { selectsWithinShuffledSession } from "./shuffle";
import { transition } from "./transition";
import { noRandom, queueContext } from "../../../tests/helpers/queue-context";
import { defaultSort } from "../track-sort";

const allTracks = { kind: "all-tracks" } as const;

const playlist = { kind: "playlist", playlistId: 1, title: "Mix" } as const;

const reversed: QueueRandom = { shuffle: (entries) => entries.toReversed(), index: () => 0 };

const library = {
  kind: "library",
  playlists: [{ id: 1, title: "Mix", description: null, trackCount: 6 }],
  sources: [],
  tracks: [],
} satisfies MusicLibrary;

function entriesOf(ids: readonly number[]) {
  return ids.map((id) => ({ sourceEntryId: id, trackId: id }));
}

function start(
  source: PlayableSource,
  ids: readonly number[],
  filter: string | null,
  { startAt = ids[0], shuffled = false, random = noRandom } = {},
) {
  const state = transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      source,
      entries: entriesOf(ids),
      filter,
      sessionId: "session",
      start: { kind: "entry", sourceEntryId: startAt },
      shuffled,
    },
    queueContext([1, 2, 3, 4, 5, 6], random),
  );

  if (!state) throw new Error("Expected a session");

  return state;
}

function upcoming(state: QueueState | null) {
  return state?.sourceQueue.map((item) => item.trackId);
}

describe("a filtered session", () => {
  it("keeps the given rows in displayed order and stores its filter", () => {
    const state = start(allTracks, [5, 2, 4], "beat", { startAt: 2 });

    expect(state.filter).toBe("beat");
    expect(state.sourceEntries).toEqual(entriesOf([5, 2, 4]));
    expect(state.current?.item.trackId).toBe(2);
    expect(state.previousSourceItems.map((item) => item.trackId)).toEqual([5]);
    expect(upcoming(state)).toEqual([4]);
  });

  it("ignores a rescan that adds tracks, matching or not", () => {
    const state = start(allTracks, [1, 3], "a");
    const context = queueContext([1, 2, 3, 4]);

    expect(
      transition(state, { type: "libraryRescanned", entries: entriesOf([1, 2, 3, 4]) }, context),
    ).toBe(state);
  });

  it("ignores playlist additions and moves, but applies removals", () => {
    const state = start(playlist, [1, 2, 3], "a");
    const context = queueContext([1, 2, 3, 4], { ...noRandom, index: () => 0 });

    expect(
      transition(
        state,
        { type: "sourceEntryAdded", playlistId: 1, entry: { sourceEntryId: 4, trackId: 4 } },
        context,
      ),
    ).toBe(state);

    expect(
      transition(
        state,
        {
          type: "sourceEntryMoved",
          playlistId: 1,
          sourceEntryId: 3,
          targetSourceEntryId: 2,
          side: "before",
          orderedSourceEntryIds: [1, 3, 2],
        },
        context,
      ),
    ).toBe(state);

    const removed = transition(
      state,
      { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 },
      context,
    );

    expect(removed?.sourceEntries).toEqual(entriesOf([1, 3]));
    expect(upcoming(removed)).toEqual([3]);
  });

  it("detaches when its playlist is deleted", () => {
    const state = start(playlist, [1, 2], "a");

    expect(
      transition(state, { type: "sourceDeleted", playlistId: 1 }, queueContext([1, 2]))?.source,
    ).toEqual({ kind: "detached", title: "Mix" });
  });

  it("shuffles and unshuffles within its own rows", () => {
    const state = start(allTracks, [2, 4, 6], "a", { startAt: 2 });
    const context = queueContext([1, 2, 3, 4, 5, 6], reversed);

    const shuffled = transition(state, { type: "setShuffleEnabled", enabled: true }, context);
    expect(upcoming(shuffled)).toEqual([6, 4]);

    const unshuffled = transition(shuffled, { type: "setShuffleEnabled", enabled: false }, context);
    expect(upcoming(unshuffled)).toEqual([4, 6]);
  });
});

describe("an unfiltered session", () => {
  it("appends tracks a rescan adds", () => {
    const state = start(allTracks, [1, 3], null);

    const rescanned = transition(
      state,
      { type: "libraryRescanned", entries: entriesOf([1, 2, 3]) },
      queueContext([1, 2, 3]),
    );

    expect(rescanned?.sourceEntries).toEqual(entriesOf([1, 3, 2]));
    expect(upcoming(rescanned)).toEqual([3, 2]);
  });

  it("takes in playlist additions", () => {
    const state = start(playlist, [1, 2], null);

    const added = transition(
      state,
      { type: "sourceEntryAdded", playlistId: 1, entry: { sourceEntryId: 3, trackId: 3 } },
      queueContext([1, 2, 3]),
    );

    expect(upcoming(added)).toEqual([2, 3]);
  });
});

describe("selectsWithinShuffledSession", () => {
  const shuffled = start(allTracks, [1, 2, 3], "a", { shuffled: true, random: reversed });

  it("selects within the session for the same source, filter and a known entry", () => {
    expect(
      selectsWithinShuffledSession(shuffled, { source: allTracks, filter: "a", sourceEntryId: 2 }),
    ).toBe(true);
  });

  it.each([
    { reason: "a different filter", filter: "b", sourceEntryId: 2 },
    { reason: "no filter", filter: null, sourceEntryId: 2 },
    { reason: "an entry outside the session", filter: "a", sourceEntryId: 4 },
  ])("starts a new session for $reason", ({ filter, sourceEntryId }) => {
    expect(
      selectsWithinShuffledSession(shuffled, { source: allTracks, filter, sourceEntryId }),
    ).toBe(false);
  });

  it("starts a new session for another source", () => {
    expect(
      selectsWithinShuffledSession(shuffled, {
        source: { kind: "playlist", playlistId: 1 },
        filter: "a",
        sourceEntryId: 2,
      }),
    ).toBe(false);
  });

  it("selects within an unfiltered shuffled session for an unfiltered click", () => {
    const unfiltered = start(allTracks, [1, 2, 3], null, { shuffled: true, random: reversed });

    expect(
      selectsWithinShuffledSession(unfiltered, {
        source: allTracks,
        filter: null,
        sourceEntryId: 3,
      }),
    ).toBe(true);
  });

  it("never selects when shuffle is off", () => {
    const ordered = start(allTracks, [1, 2, 3], "a");

    expect(
      selectsWithinShuffledSession(ordered, { source: allTracks, filter: "a", sourceEntryId: 2 }),
    ).toBe(false);
  });
});

describe("saved sessions", () => {
  it("round-trips a filtered session", () => {
    const state = start(playlist, [3, 1, 5], "beat", { startAt: 1 });

    const restored = parseQueueSession(
      { payload: serializeQueueSession(state), position: 4 },
      library,
    );

    expect(restored).toEqual({ state: { ...state, status: "paused" }, position: 4 });
  });

  it("round-trips an unfiltered session with a null filter", () => {
    const state = start(allTracks, [1, 2], null);

    const restored = parseQueueSession(
      { payload: serializeQueueSession(state), position: 0 },
      library,
    );

    expect(restored?.state.filter).toBeNull();
  });

  it("writes version 7 with the session's sort", () => {
    expect(JSON.parse(serializeQueueSession(start(allTracks, [1], null)))).toMatchObject({
      version: 7,
      state: { sort: { field: "added", direction: "asc" } },
    });
  });

  it("restores nothing from a version 6 payload, without throwing", () => {
    const saved = JSON.parse(serializeQueueSession(start(allTracks, [1, 2], null)));
    const { sort: _sort, ...v6State } = saved.state;
    const payload = JSON.stringify({ version: 6, state: v6State });

    expect(parseQueueSession({ payload, position: 3 }, library)).toBeNull();
  });

  it("restores nothing from a version 5 payload, without throwing", () => {
    const saved = JSON.parse(serializeQueueSession(start(allTracks, [1, 2], null)));
    const { filter: _filter, ...v5State } = saved.state;
    const payload = JSON.stringify({ version: 5, state: v5State });

    expect(parseQueueSession({ payload, position: 3 }, library)).toBeNull();
  });

  it("rejects a version 7 payload without a filter", () => {
    const saved = JSON.parse(serializeQueueSession(start(allTracks, [1, 2], null)));
    delete saved.state.filter;

    expect(parseQueueSession({ payload: JSON.stringify(saved), position: 0 }, library)).toBeNull();
  });
});
