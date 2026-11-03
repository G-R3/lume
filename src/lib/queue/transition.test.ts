import { expect, it } from "vite-plus/test";
import type { QueuePosition } from "./commands";
import type { QueueState } from "./model";
import { transition } from "./transition";
import { queueContext } from "../../../tests/helpers/queue-context";
import { defaultSort } from "../track-sort";

it("plays each manual addition before returning to the source", () => {
  const context = queueContext([1, 2, 3]);
  const source = { kind: "all-tracks" as const };
  const entries = [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId }));

  const started = transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      filter: null,
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
    { type: "enqueueTracks", items: [{ trackId: 3, queueItemId: "manual-1" }], position: "end" },
    context,
  );

  const withBothAdditions = transition(
    withFirstAddition,
    { type: "enqueueTracks", items: [{ trackId: 3, queueItemId: "manual-2" }], position: "end" },
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
      sort: defaultSort,
      filter: null,
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
      sort: defaultSort,
      filter: null,
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
      sort: defaultSort,
      filter: null,
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
    { type: "enqueueTracks", items: [{ trackId: 4, queueItemId: "manual-1" }], position: "end" },
    context,
  );

  const secondManual = transition(
    firstManual,
    { type: "enqueueTracks", items: [{ trackId: 4, queueItemId: "manual-2" }], position: "end" },
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
      sort: defaultSort,
      filter: null,
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
      sort: defaultSort,
      filter: null,
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

it.each([
  { position: "start", expected: ["A", "B", "C", "X", "Y"] },
  { position: "end", expected: ["X", "Y", "A", "B", "C"] },
] as const)(
  "places a batch at the $position of the manual queue without touching playback",
  ({ position, expected }) => {
    const context = queueContext([1, 2, 3, 4, 5, 6]);
    const queued = enqueue(startedAt(1, context), ["X", "Y"], "end", context);

    const placed = enqueue(queued, ["A", "B", "C"], position, context);

    expect(placed?.manualQueue.map((item) => item.queueItemId)).toEqual(expected);
    expect(placed?.current).toEqual(queued?.current);
    expect(placed?.status).toBe(queued?.status);
    expect(placed?.sourceQueue).toEqual(queued?.sourceQueue);
    expect(placed?.previousSourceItems).toEqual(queued?.previousSourceItems);
  },
);

it("puts each Play next group ahead of earlier ones and plays them before resuming the source", () => {
  const context = queueContext([1, 2, 3, 4, 5, 6]);
  const queued = enqueue(startedAt(1, context), ["X", "Y"], "end", context);
  const firstGroup = enqueue(queued, ["A", "B", "C"], "start", context);

  const secondGroup = enqueue(firstGroup, ["D", "E"], "start", context);

  expect(secondGroup?.manualQueue.map((item) => item.queueItemId)).toEqual([
    "D",
    "E",
    "A",
    "B",
    "C",
    "X",
    "Y",
  ]);

  const played: (string | undefined)[] = [];
  let state = firstGroup;

  for (let step = 0; step < 6; step++) {
    state = transition(state, { type: "next" }, context);
    played.push(state?.current?.item.queueItemId);
  }

  expect(played.slice(0, 5)).toEqual(["A", "B", "C", "X", "Y"]);
  expect(state?.current).toMatchObject({ lane: "source", item: { trackId: 2 } });
});

it("keeps every duplicate track that arrives with a distinct id", () => {
  const context = queueContext([1, 2, 3]);

  const placed = transition(
    startedAt(1, context),
    {
      type: "enqueueTracks",
      items: [
        { trackId: 3, queueItemId: "first" },
        { trackId: 3, queueItemId: "second" },
        { trackId: 2, queueItemId: "third" },
      ],
      position: "start",
    },
    context,
  );

  expect(placed?.manualQueue.map((item) => [item.queueItemId, item.trackId])).toEqual([
    ["first", 3],
    ["second", 3],
    ["third", 2],
  ]);
});

it("starts the first Play next item of a stopped queue and puts the rest before earlier additions", () => {
  const context = queueContext([1, 2, 3, 4, 5, 6]);
  const ended = transition(startedAt(1, context), { type: "next" }, queueContext([1]));

  if (!ended) throw new Error("Expected a stopped session");
  expect(ended).toMatchObject({ current: null, status: "stopped" });

  const queued: QueueState = {
    ...ended,
    manualQueue: [{ queueItemId: "X", trackId: 6, origin: { kind: "manual" } }],
  };

  const placed = enqueue(queued, ["A", "B", "C"], "start", context);

  expect(placed).toMatchObject({
    status: "playing",
    current: { lane: "manual", item: { queueItemId: "A" } },
  });
  expect(placed?.manualQueue.map((item) => item.queueItemId)).toEqual(["B", "C", "X"]);
});

function startedAt(sourceEntryId: number, context: ReturnType<typeof queueContext>) {
  return transition(
    null,
    {
      type: "startSession",
      sort: defaultSort,
      filter: null,
      source: { kind: "all-tracks" },
      entries: [1, 2, 3, 4, 5, 6].map((trackId) => ({ sourceEntryId: trackId, trackId })),
      start: { kind: "entry", sourceEntryId },
      shuffled: false,
      sessionId: "session",
    },
    context,
  );
}

function enqueue(
  state: QueueState | null,
  ids: readonly string[],
  position: QueuePosition,
  context: ReturnType<typeof queueContext>,
) {
  return transition(
    state,
    {
      type: "enqueueTracks",
      items: ids.map((queueItemId, index) => ({ trackId: index + 3, queueItemId })),
      position,
    },
    context,
  );
}
