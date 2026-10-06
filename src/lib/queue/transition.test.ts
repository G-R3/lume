import { expect, it } from "vite-plus/test";
import type { QueueState } from "./model";
import { transition } from "./transition";
import { queueContext } from "../../../tests/helpers/queue-context";

it("plays each manual addition before returning to the source", () => {
  const context = queueContext([1, 2, 3]);
  const source = { kind: "all-tracks" as const };
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      source,
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
    },
    context,
  );

  const withFirstAddition = transition(
    started,
    { type: "enqueueTrack", trackId: 3, queueItemId: "manual-1" },
    context,
  );

  const withBothAdditions = transition(
    withFirstAddition,
    { type: "enqueueTrack", trackId: 3, queueItemId: "manual-2" },
    context,
  );

  const firstNext = transition(withBothAdditions, { type: "next" }, context);
  const secondNext = transition(firstNext, { type: "next" }, context);
  const backToSource = transition(secondNext, { type: "next" }, context);

  expect([
    firstNext?.current?.item.queueItemId,
    secondNext?.current?.item.queueItemId,
    backToSource?.current?.item.trackId,
  ]).toEqual(["manual-1", "manual-2", 2]);
});

it("keeps a queue reorder when the playlist later moves one occurrence", () => {
  const context = queueContext([1, 2, 3, 4, 5]);
  const source = { kind: "playlist" as const, playlistId: 1, title: "A–E" };
  const entries = [1, 2, 3, 4, 5].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      source,
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
    },
    context,
  );

  const reorderedQueue = transition(
    started,
    {
      type: "moveQueueItem",
      queueItemId: sourceQueueItemId(started, 2),
      to: "source",
      beforeQueueItemId: sourceQueueItemId(started, 4),
    },
    context,
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
      context,
    );

  const afterFirstMove = moveBefore(reorderedQueue, 4, [1, 2, 3, 5, 4]);
  expect(afterFirstMove?.sourceQueue.map((item) => item.trackId)).toEqual([3, 2, 5, 4]);

  const afterSecondMove = moveBefore(afterFirstMove, 3, [1, 2, 5, 3, 4]);
  expect(afterSecondMove?.sourceQueue.map((item) => item.trackId)).toEqual([5, 3, 2, 4]);

  const afterThirdMove = moveBefore(afterSecondMove, 2, [1, 5, 2, 3, 4]);
  expect(afterThirdMove?.sourceQueue.map((item) => item.trackId)).toEqual([3, 5, 2, 4]);
});

it("lets Previous visit source items skipped by a jump", () => {
  const context = queueContext([1, 2, 3, 4]);
  const entries = [1, 2, 3, 4].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      source: { kind: "all-tracks" },
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
    },
    context,
  );

  const jumped = transition(
    started,
    { type: "jumpTo", queueItemId: sourceQueueItemId(started, 4) },
    context,
  );

  const previousC = transition(jumped, { type: "previous" }, context);
  const previousB = transition(previousC, { type: "previous" }, context);
  const previousA = transition(previousB, { type: "previous" }, context);

  expect([
    jumped?.current?.item.trackId,
    previousC?.current?.item.trackId,
    previousB?.current?.item.trackId,
    previousA?.current?.item.trackId,
  ]).toEqual([4, 3, 2, 1]);
  expect(previousA?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3, 4]);
});

it("skips unavailable source items after a manual jump and Previous", () => {
  const context = queueContext([1, 3, 4]);
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      source: { kind: "all-tracks" },
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "session",
    },
    context,
  );

  const firstManual = transition(
    started,
    { type: "enqueueTrack", trackId: 4, queueItemId: "manual-1" },
    context,
  );

  const secondManual = transition(
    firstManual,
    { type: "enqueueTrack", trackId: 4, queueItemId: "manual-2" },
    context,
  );

  const jumped = transition(secondManual, { type: "jumpTo", queueItemId: "manual-2" }, context);

  expect(jumped?.current?.item.queueItemId).toBe("manual-2");

  const previous = transition(jumped, { type: "previous" }, context);
  const next = transition(previous, { type: "next" }, context);

  expect(previous?.current?.item.trackId).toBe(1);
  expect(next?.current?.item.trackId).toBe(3);
});

it("keeps a moved manual item when its source is rebuilt", () => {
  const context = queueContext([1, 2, 3]);
  const source = { kind: "playlist" as const, playlistId: 1, title: "Playlist" };
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      source,
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "first",
    },
    context,
  );

  const moved = transition(
    started,
    { type: "moveQueueItem", queueItemId: sourceQueueItemId(started, 2), to: "manual" },
    context,
  );

  expect(moved?.manualQueue.map((item) => item.trackId)).toEqual([2]);
  expect(moved?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  const rebuilt = transition(
    moved,
    {
      type: "startSession",
      source,
      entries,
      start: { kind: "entry", sourceEntryId: 1 },
      shuffled: false,
      sessionId: "second",
    },
    context,
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
