import { expect, it } from "vite-plus/test";
import { transition, type QueueState } from "./queue";

it("plays each manual addition before returning to the source", () => {
  const available = new Set([1, 2, 3]);
  const source = { kind: "all-tracks" as const };
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    { type: "startFromSource", source, entries, startEntryId: 1, sessionId: "session" },
    available,
  );

  const withFirstAddition = transition(
    started,
    { type: "enqueueTrack", trackId: 3, queueItemId: "manual-1" },
    available,
  );

  const withBothAdditions = transition(
    withFirstAddition,
    { type: "enqueueTrack", trackId: 3, queueItemId: "manual-2" },
    available,
  );

  const firstNext = transition(withBothAdditions, { type: "next", reason: "skip" }, available);
  const secondNext = transition(firstNext, { type: "next", reason: "skip" }, available);
  const backToSource = transition(secondNext, { type: "next", reason: "skip" }, available);

  expect([
    firstNext?.current?.item.queueItemId,
    secondNext?.current?.item.queueItemId,
    backToSource?.current?.item.trackId,
  ]).toEqual(["manual-1", "manual-2", 2]);
});

it("keeps a queue reorder when the playlist later moves one occurrence", () => {
  const available = new Set([1, 2, 3, 4, 5]);
  const source = { kind: "playlist" as const, playlistId: 1, title: "A–E" };
  const entries = [1, 2, 3, 4, 5].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    { type: "startFromSource", source, entries, startEntryId: 1, sessionId: "session" },
    available,
  );

  const reorderedQueue = transition(
    started,
    {
      type: "moveQueueItem",
      queueItemId: sourceQueueItemId(started, 2),
      to: "source",
      beforeQueueItemId: sourceQueueItemId(started, 4),
    },
    available,
  );

  expect(reorderedQueue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 2, 4, 5]);

  const moveBefore = (state: typeof reorderedQueue, targetSourceEntryId: number, order: number[]) =>
    transition(
      state,
      {
        type: "sourceEntryMoved",
        playlistId: 1,
        sourceEntryId: 5,
        targetSourceEntryId,
        side: "before",
        orderedSourceEntryIds: order,
      },
      available,
    );

  const afterFirstMove = moveBefore(reorderedQueue, 4, [1, 2, 3, 5, 4]);
  expect(afterFirstMove?.sourceQueue.map((item) => item.trackId)).toEqual([3, 2, 5, 4]);

  const afterSecondMove = moveBefore(afterFirstMove, 3, [1, 2, 5, 3, 4]);
  expect(afterSecondMove?.sourceQueue.map((item) => item.trackId)).toEqual([5, 3, 2, 4]);

  const afterThirdMove = moveBefore(afterSecondMove, 2, [1, 5, 2, 3, 4]);
  expect(afterThirdMove?.sourceQueue.map((item) => item.trackId)).toEqual([3, 5, 2, 4]);
});

it("lets Previous visit source items skipped by a jump", () => {
  const available = new Set([1, 2, 3, 4]);
  const entries = [1, 2, 3, 4].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startFromSource",
      source: { kind: "all-tracks" },
      entries,
      startEntryId: 1,
      sessionId: "session",
    },
    available,
  );

  const jumped = transition(
    started,
    { type: "jumpTo", queueItemId: sourceQueueItemId(started, 4) },
    available,
  );

  const previousC = transition(jumped, { type: "previous" }, available);
  const previousB = transition(previousC, { type: "previous" }, available);
  const previousA = transition(previousB, { type: "previous" }, available);

  expect([
    jumped?.current?.item.trackId,
    previousC?.current?.item.trackId,
    previousB?.current?.item.trackId,
    previousA?.current?.item.trackId,
  ]).toEqual([4, 3, 2, 1]);
  expect(previousA?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3, 4]);
});

it("skips unavailable source items after a manual jump and Previous", () => {
  const available = new Set([1, 3, 4]);
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startFromSource",
      source: { kind: "all-tracks" },
      entries,
      startEntryId: 1,
      sessionId: "session",
    },
    available,
  );

  const firstManual = transition(
    started,
    { type: "enqueueTrack", trackId: 4, queueItemId: "manual-1" },
    available,
  );

  const secondManual = transition(
    firstManual,
    { type: "enqueueTrack", trackId: 4, queueItemId: "manual-2" },
    available,
  );

  const jumped = transition(secondManual, { type: "jumpTo", queueItemId: "manual-2" }, available);

  expect(jumped?.current?.item.queueItemId).toBe("manual-2");

  const previous = transition(jumped, { type: "previous" }, available);
  const next = transition(previous, { type: "next", reason: "skip" }, available);

  expect(previous?.current?.item.trackId).toBe(1);
  expect(next?.current?.item.trackId).toBe(3);
});

it("keeps a moved manual item when its source is rebuilt", () => {
  const available = new Set([1, 2, 3]);
  const source = { kind: "playlist" as const, playlistId: 1, title: "Playlist" };
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    { type: "startFromSource", source, entries, startEntryId: 1, sessionId: "first" },
    available,
  );

  const moved = transition(
    started,
    { type: "moveQueueItem", queueItemId: sourceQueueItemId(started, 2), to: "manual" },
    available,
  );

  expect(moved?.manualQueue.map((item) => item.trackId)).toEqual([2]);
  expect(moved?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  const rebuilt = transition(
    moved,
    { type: "startFromSource", source, entries, startEntryId: 1, sessionId: "second" },
    available,
  );

  expect(rebuilt?.manualQueue.map((item) => item.trackId)).toEqual([2]);
  expect(rebuilt?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3]);
});

function sourceQueueItemId(state: QueueState | null, sourceEntryId: number) {
  const item = state?.sourceQueue.find(
    (candidate) =>
      candidate.origin.kind === "source" && candidate.origin.sourceEntryId === sourceEntryId,
  );

  if (!item) throw new Error(`Expected source entry ${sourceEntryId} in the queue`);

  return item.queueItemId;
}
