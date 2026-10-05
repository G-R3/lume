import { expect, it } from "vite-plus/test";
import {
  parseQueueSession,
  prepareShuffle,
  serializeQueueSession,
  setShuffleEnabled,
  transition,
  type QueueState,
} from "./queue";

const available = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

const source = { kind: "playlist" as const, playlistId: 1, title: "A-E" };

const entries = [1, 2, 3, 4, 5].map((trackId) => ({ sourceEntryId: trackId, trackId }));

const library = {
  kind: "library" as const,
  playlists: [{ id: 1, title: "A-E", description: null, trackCount: 5 }],
  sources: [],
  tracks: [],
};

it("restores source order after toggling and keeps removals and manual priority", () => {
  const started = startPlaylist(2);

  const removed = transition(
    started,
    { type: "removeQueueItem", queueItemId: sourceQueueItemId(started, 4) },
    available,
  );

  const reordered = transition(
    removed,
    {
      type: "moveQueueItem",
      queueItemId: sourceQueueItemId(removed, 5),
      to: "source",
      beforeQueueItemId: sourceQueueItemId(removed, 3),
    },
    available,
  );

  const firstManual = transition(
    reordered,
    { type: "enqueueTrack", trackId: 5, queueItemId: "manual-5" },
    available,
  );

  const secondManual = transition(
    firstManual,
    { type: "enqueueTrack", trackId: 6, queueItemId: "manual-6" },
    available,
  );

  const manualOrder = transition(
    secondManual,
    {
      type: "moveQueueItem",
      queueItemId: "manual-6",
      to: "manual",
      beforeQueueItemId: "manual-5",
    },
    available,
  );

  const shuffled = shuffle(manualOrder, [5, 1, 3]);
  expect(shuffled.current?.item.trackId).toBe(2);
  expect(shuffled.sourceQueue.map((item) => item.trackId)).toEqual([5, 1, 3]);
  expect(shuffled.manualQueue.map((item) => item.trackId)).toEqual([6, 5]);

  const sequential = unshuffle(shuffled);
  expect(sequential.current?.item.trackId).toBe(2);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([3, 5]);
  expect(sequential.manualQueue.map((item) => item.trackId)).toEqual([6, 5]);

  const nextManual = transition(sequential, { type: "next", reason: "skip" }, available);
  const lastManual = transition(nextManual, { type: "next", reason: "skip" }, available);
  const nextSource = transition(lastManual, { type: "next", reason: "skip" }, available);
  expect([
    nextManual?.current?.item.trackId,
    lastManual?.current?.item.trackId,
    nextSource?.current?.item.trackId,
  ]).toEqual([6, 5, 3]);
});

it("continues after the moved source anchor while a manual song plays", () => {
  const manual = playManualAfterShuffle(2, [5, 1, 4, 3]);

  const moved = transition(
    manual,
    {
      type: "sourceEntryMoved",
      playlistId: 1,
      sourceEntryId: 2,
      targetSourceEntryId: 4,
      side: "after",
      orderedSourceEntryIds: [1, 3, 4, 2, 5],
    },
    available,
  );

  const sequential = unshuffle(moved);
  expect(sequential.current?.item.trackId).toBe(6);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([5]);
  expect(
    transition(sequential, { type: "next", reason: "skip" }, available)?.current?.item.trackId,
  ).toBe(5);
});

it("keeps the continuation boundary through insertions, removal, and a move", () => {
  const manual = playManualAfterShuffle(2, [5, 1, 4, 3]);

  const removedAnchor = transition(
    manual,
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 },
    available,
  );

  expect(unshuffle(removedAnchor).sourceQueue.map((item) => item.trackId)).toEqual([3, 4, 5]);

  const insertedBefore = transition(
    removedAnchor,
    {
      type: "sourceEntryAdded",
      playlistId: 1,
      entry: { sourceEntryId: 7, trackId: 7 },
      canonicalIndex: 0,
      insertionIndex: 0,
    },
    available,
  );

  expect(unshuffle(insertedBefore).sourceQueue.map((item) => item.trackId)).toEqual([3, 4, 5]);

  const removedBefore = transition(
    insertedBefore,
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 1 },
    available,
  );

  expect(unshuffle(removedBefore).sourceQueue.map((item) => item.trackId)).toEqual([3, 4, 5]);

  const insertedAtBoundary = transition(
    removedBefore,
    {
      type: "sourceEntryAdded",
      playlistId: 1,
      entry: { sourceEntryId: 8, trackId: 8 },
      canonicalIndex: 1,
      insertionIndex: 1,
    },
    available,
  );

  expect(unshuffle(insertedAtBoundary).sourceQueue.map((item) => item.trackId)).toEqual([
    8, 3, 4, 5,
  ]);

  const movedBefore = transition(
    insertedAtBoundary,
    {
      type: "sourceEntryMoved",
      playlistId: 1,
      sourceEntryId: 5,
      targetSourceEntryId: 7,
      side: "before",
      orderedSourceEntryIds: [5, 7, 8, 3, 4],
    },
    available,
  );

  const sequential = unshuffle(movedBefore);
  expect(sequential.current?.item.trackId).toBe(6);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([8, 3, 4]);
  expect(
    transition(sequential, { type: "next", reason: "skip" }, available)?.current?.item.trackId,
  ).toBe(8);
});

it("stops after a manual song when the deleted source anchor was last", () => {
  const manual = playManualAfterShuffle(5, [4, 2, 1, 3]);

  const removed = transition(
    manual,
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 5 },
    available,
  );

  const sequential = unshuffle(removed);
  expect(sequential.current?.item.trackId).toBe(6);
  expect(sequential.sourceQueue).toEqual([]);
  const completed = transition(sequential, { type: "next", reason: "ended" }, available);
  expect(completed?.current).toBe(null);
  expect(completed?.status).toBe("stopped");
});

it("keeps a carried source item independent of the next session's occurrence", () => {
  const started = startPlaylist(1);
  const carriedItemId = sourceQueueItemId(started, 2);

  const moved = transition(
    started,
    { type: "moveQueueItem", queueItemId: carriedItemId, to: "manual" },
    available,
  );

  const rebuilt = transition(
    moved,
    { type: "startFromSource", source, entries, startEntryId: 1, sessionId: "second" },
    available,
  );

  const removedOccurrence = transition(
    shuffle(rebuilt, [5, 2, 4, 3]),
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 },
    available,
  );

  expect(removedOccurrence?.manualQueue.map((item) => item.trackId)).toEqual([2]);
  expect(removedOccurrence?.sourceQueue.map((item) => item.trackId)).toEqual([5, 4, 3]);

  const inserted = transition(
    removedOccurrence,
    {
      type: "moveQueueItem",
      queueItemId: carriedItemId,
      to: "source",
      beforeQueueItemId: sourceQueueItemId(removedOccurrence, 3),
    },
    available,
  );

  const sequential = unshuffle(inserted);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([2, 3, 4, 5]);
  const carried = transition(sequential, { type: "next", reason: "skip" }, available);
  expect(carried?.current?.item.trackId).toBe(2);
  expect(carried?.current?.item.origin).toEqual({
    kind: "source",
    sourceEntryId: 2,
    source: { kind: "playlist", playlistId: 1 },
    sessionId: "first",
  });
  expect(carried?.sourcePosition).toEqual({ kind: "entry", sourceEntryId: 1 });
  expect(
    transition(carried, { type: "next", reason: "skip" }, available)?.current?.item.trackId,
  ).toBe(3);
});

it("pulls one duplicate occurrence from the table but skips through a queue jump", () => {
  const started = transition(
    null,
    {
      type: "startFromSource",
      source,
      entries: [
        { sourceEntryId: 11, trackId: 1 },
        { sourceEntryId: 12, trackId: 2 },
        { sourceEntryId: 13, trackId: 1 },
        { sourceEntryId: 14, trackId: 3 },
      ],
      startEntryId: 11,
      sessionId: "duplicates",
    },
    available,
  );

  const manual = transition(
    shuffle(started, [14, 13, 12]),
    { type: "enqueueTrack", trackId: 1, queueItemId: "manual-1" },
    available,
  );

  const selected = transition(
    manual,
    { type: "selectSourceEntry", source, sourceEntryId: 13 },
    available,
  );

  expect(selected?.current?.item.origin).toMatchObject({ sourceEntryId: 13 });
  expect(selected?.sourceQueue.map((item) => item.trackId)).toEqual([3, 2]);
  expect(selected?.manualQueue.map((item) => item.trackId)).toEqual([1]);

  const absent = transition(
    selected,
    { type: "selectSourceEntry", source, sourceEntryId: 11 },
    available,
  );

  expect(absent?.current?.item.origin).toMatchObject({ sourceEntryId: 11 });
  expect(absent?.sourceQueue.map((item) => item.trackId)).toEqual([3, 2]);

  const jumped = transition(
    manual,
    { type: "jumpTo", queueItemId: sourceQueueItemId(manual, 13) },
    available,
  );

  expect(jumped?.current?.item.origin).toMatchObject({ sourceEntryId: 13 });
  expect(jumped?.sourceQueue.map((item) => item.trackId)).toEqual([2]);
  expect(jumped?.manualQueue.map((item) => item.trackId)).toEqual([1]);
  const previous = transition(jumped, { type: "previous" }, available);
  expect(previous?.current?.item.origin).toMatchObject({ sourceEntryId: 14 });
  expect(previous?.sourceQueue.map((item) => item.trackId)).toEqual([1, 2]);
});

it("keeps shuffle order through source edits and inserts only the new occurrence", () => {
  const moved = transition(
    shuffle(startPlaylist(2), [5, 1, 4, 3]),
    {
      type: "sourceEntryMoved",
      playlistId: 1,
      sourceEntryId: 5,
      targetSourceEntryId: 1,
      side: "before",
      orderedSourceEntryIds: [5, 1, 2, 3, 4],
    },
    available,
  );

  expect(moved?.sourceQueue.map((item) => item.trackId)).toEqual([5, 1, 4, 3]);

  const added = transition(
    moved,
    {
      type: "sourceEntryAdded",
      playlistId: 1,
      entry: { sourceEntryId: 6, trackId: 6 },
      canonicalIndex: 3,
      insertionIndex: 2,
    },
    available,
  );

  expect(added?.sourceQueue.map((item) => item.trackId)).toEqual([5, 1, 6, 4, 3]);

  const removed = transition(
    added,
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 4 },
    available,
  );

  expect(removed?.sourceQueue.map((item) => item.trackId)).toEqual([5, 1, 6, 3]);
  const sequential = unshuffle(removed);
  expect(sequential.current?.item.trackId).toBe(2);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([6, 3]);
});

it("restores a shuffled pass and lets Previous return through repeated visits", () => {
  const second = transition(startPlaylist(1), { type: "next", reason: "skip" }, available);
  const third = transition(second, { type: "next", reason: "skip" }, available);

  const removed = transition(
    third,
    { type: "removeQueueItem", queueItemId: sourceQueueItemId(third, 5) },
    available,
  );

  const revisited = transition(
    shuffle(removed, [2, 1, 4]),
    { type: "next", reason: "skip" },
    available,
  );

  const firstManual = transition(
    revisited,
    { type: "enqueueTrack", trackId: 6, queueItemId: "manual-6" },
    available,
  );

  const secondManual = transition(
    firstManual,
    { type: "enqueueTrack", trackId: 7, queueItemId: "manual-7" },
    available,
  );

  const manualOrder = transition(
    secondManual,
    {
      type: "moveQueueItem",
      queueItemId: "manual-7",
      to: "manual",
      beforeQueueItemId: "manual-6",
    },
    available,
  );

  if (!manualOrder) throw new Error("Expected an active queue");
  const restored = parseQueueSession(serializeQueueSession(manualOrder, 19.5), library);

  if (!restored) throw new Error("Expected a restored session");
  expect(restored.position).toBe(19.5);
  expect(restored.state).toMatchObject({
    source: { kind: "playlist", playlistId: 1, title: "A-E" },
    sourceIdentity: { kind: "playlist", playlistId: 1 },
    sourcePosition: { kind: "entry", sourceEntryId: 2 },
    current: { item: { trackId: 2 } },
    suppressedSourceEntryIds: [5],
    shuffleEnabled: true,
    status: "paused",
  });
  expect(restored.state.manualQueue.map((item) => item.trackId)).toEqual([7, 6]);
  expect(restored.state.sourceQueue.map((item) => item.trackId)).toEqual([1, 4]);
  expect(restored.state.previousSourceItems.map((item) => item.trackId)).toEqual([1, 2, 3]);

  const previousThird = transition(restored.state, { type: "previous" }, available);
  const previousSecond = transition(previousThird, { type: "previous" }, available);
  const previousFirst = transition(previousSecond, { type: "previous" }, available);
  expect([
    previousThird?.current?.item.trackId,
    previousSecond?.current?.item.trackId,
    previousFirst?.current?.item.trackId,
  ]).toEqual([3, 2, 1]);
  expect(previousFirst?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3, 2, 1, 4]);
  expect(previousFirst?.manualQueue.map((item) => item.trackId)).toEqual([7, 6]);
});

it("rejects duplicate stored queue IDs and restores valid deleted-anchor continuation", () => {
  const removed = transition(
    playManualAfterShuffle(2, [5, 1, 4, 3]),
    { type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 },
    available,
  );

  if (!removed) throw new Error("Expected an active queue");

  const duplicateIds = {
    ...removed,
    sourceQueue: removed.sourceQueue.map((item, index) =>
      index === 0 ? { ...item, queueItemId: "manual-6" } : item,
    ),
  };

  expect(parseQueueSession(serializeQueueSession(duplicateIds, 7.25), library)).toBe(null);

  const restored = parseQueueSession(serializeQueueSession(removed, 7.25), library);

  if (!restored) throw new Error("Expected a restored session");
  expect(restored.position).toBe(7.25);
  expect(restored.state.current?.item.trackId).toBe(6);
  expect(restored.state.sourceQueue.map((item) => item.trackId)).toEqual([5, 1, 4, 3]);
  expect(restored.state.status).toBe("paused");

  const sequential = unshuffle(restored.state);
  expect(sequential.current?.item.trackId).toBe(6);
  expect(sequential.sourceQueue.map((item) => item.trackId)).toEqual([3, 4, 5]);
  expect(
    transition(sequential, { type: "next", reason: "skip" }, available)?.current?.item.trackId,
  ).toBe(3);
});

function startPlaylist(startEntryId: number) {
  const state = transition(
    null,
    { type: "startFromSource", source, entries, startEntryId, sessionId: "first" },
    available,
  );

  if (!state) throw new Error("Expected an active queue");

  return state;
}

/** Start the playlist, shuffle it, and skip to a queued manual song (track 6). */
function playManualAfterShuffle(startEntryId: number, orderedSourceEntryIds: number[]) {
  const queued = transition(
    shuffle(startPlaylist(startEntryId), orderedSourceEntryIds),
    { type: "enqueueTrack", trackId: 6, queueItemId: "manual-6" },
    available,
  );

  return transition(queued, { type: "next", reason: "skip" }, available);
}

function shuffle(state: QueueState | null, orderedSourceEntryIds: number[]) {
  if (!state) throw new Error("Expected an active queue");

  return setShuffleEnabled(state, true, prepareShuffle(state, true), orderedSourceEntryIds);
}

function unshuffle(state: QueueState | null) {
  if (!state) throw new Error("Expected an active queue");

  return setShuffleEnabled(state, false, prepareShuffle(state, false));
}

function sourceQueueItemId(state: QueueState | null, sourceEntryId: number) {
  const item = state?.sourceQueue.find(
    (candidate) =>
      candidate.origin.kind === "source" && candidate.origin.sourceEntryId === sourceEntryId,
  );

  if (!item) throw new Error(`Expected source entry ${sourceEntryId} in the queue`);

  return item.queueItemId;
}
