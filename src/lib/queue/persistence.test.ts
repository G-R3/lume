import { expect, it } from "vite-plus/test";
import { ZodError } from "zod";
import type { MusicLibrary } from "@shared/library";
import type { QueueState } from "./model";
import { parseQueueSession, serializeQueueSession } from "./persistence";
import { transition } from "./transition";
import { queueContext } from "../../../tests/helpers/queue-context";
import { DEFAULT_SORT } from "../track-sort";

const library = {
  kind: "library",
  playlists: [{ id: 1, title: "Mix", description: null, trackCount: 3 }],
  sources: [],
  tracks: [],
} satisfies MusicLibrary;

const context = queueContext([1, 2, 3, 7, 8]);

function playlistSession(sessionId: string, previous: QueueState | null, startAt = 20) {
  const state = transition(
    previous,
    {
      type: "startSession",
      sort: DEFAULT_SORT,
      source: { kind: "playlist", playlistId: 1, title: "Mix" },
      entries: [1, 2, 3].map((id) => ({ sourceEntryId: id * 10, trackId: id })),
      filter: null,
      sessionId,
      start: { kind: "entry", sourceEntryId: startAt },
      shuffled: false,
    },
    context,
  );

  if (!state) throw new Error("Expected a session");

  return state;
}

function apply(state: QueueState, ...commands: Parameters<typeof transition>[1][]) {
  return commands.reduce<QueueState>((current, command) => {
    const next = transition(current, command, context);

    if (!next) throw new Error("Expected a session");

    return next;
  }, state);
}

function enqueue(position: "start" | "end", ...items: [number, string][]) {
  return {
    type: "enqueueTracks",
    items: items.map(([trackId, queueItemId]) => ({ trackId, queueItemId })),
    position,
  } as const;
}

function stopped(state: QueueState) {
  if (state.playback.kind !== "stopped") throw new Error("Expected a stopped session");

  return { ...state, playback: state.playback };
}

function saved(payload: string, position = 12.5) {
  return { payload, position };
}

const storedPlayNextSession =
  '{"sessionId":"session","source":{"kind":"playlist","playlistId":1,"title":"Mix"},' +
  '"tracking":{"kind":"follows-source"},"sort":{"field":"added","direction":"asc"},' +
  '"sourceEntries":[{"sourceEntryId":10,"trackId":1},{"sourceEntryId":20,"trackId":2},{"sourceEntryId":30,"trackId":3}],' +
  '"sourcePosition":{"kind":"entry","sourceEntryId":20},"shuffleEnabled":false,' +
  '"playback":{"kind":"active","current":{"queueItemId":"session:source:20","trackId":2,' +
  '"origin":{"kind":"source","sourceEntryId":20,"source":{"kind":"playlist","playlistId":1},"sessionId":"session"}},' +
  '"status":"playing","role":"source-step"},' +
  '"manualQueue":[{"queueItemId":"manual-7","trackId":7,"origin":{"kind":"manual"}},' +
  '{"queueItemId":"manual-8","trackId":8,"origin":{"kind":"manual"}}],' +
  '"sourceQueue":[{"queueItemId":"session:source:30","trackId":3,' +
  '"origin":{"kind":"source","sourceEntryId":30,"source":{"kind":"playlist","playlistId":1},"sessionId":"session"}}],' +
  '"previousSourceItems":[{"queueItemId":"session:source:10","trackId":1,' +
  '"origin":{"kind":"source","sourceEntryId":10,"source":{"kind":"playlist","playlistId":1},"sessionId":"session"}}],' +
  '"suppressedSourceEntryIds":[]}';

it("restores a stored session with Play next items, paused", () => {
  const state = apply(
    playlistSession("session", null),
    enqueue("start", [7, "manual-7"]),
    enqueue("end", [8, "manual-8"]),
  );

  const restored = {
    state: { ...state, playback: { ...state.playback, status: "paused" } },
    position: 12.5,
  };

  expect(parseQueueSession(saved(storedPlayNextSession), library)).toEqual(restored);
  expect(parseQueueSession(saved(serializeQueueSession(state)), library)).toEqual(restored);
});

it("restores a stopped session whose last played item is also in its history", () => {
  const state = stopped(apply(playlistSession("session", null, 30), { type: "next" }));

  expect(state.previousSourceItems).toContainEqual(state.playback.lastPlayed);
  expect(parseQueueSession(saved(serializeQueueSession(state)), library)?.state).toEqual(state);
});

it("rejects a saved session that queues one item twice or saves a bad position", () => {
  const state = apply(playlistSession("session", null), enqueue("end", [7, "manual-7"]));
  const repeated = { ...state, sourceQueue: [...state.sourceQueue, ...state.manualQueue] };

  expect(() => parseQueueSession(saved(serializeQueueSession(repeated)), library)).toThrow(
    ZodError,
  );

  for (const position of [-1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => parseQueueSession(saved(serializeQueueSession(state), position), library)).toThrow(
      ZodError,
    );
});

it("never reuses the queue item ID of a last played Play next item", () => {
  const state = stopped(
    apply(
      playlistSession("session", null, 30),
      enqueue("end", [7, "next:source:10"]),
      { type: "next" },
      { type: "next" },
    ),
  );

  expect(state.playback.lastPlayed).toMatchObject({ queueItemId: "next:source:10", trackId: 7 });
  expect(apply(state, enqueue("end", [8, "next:source:10"]))).toBe(state);

  const restarted = playlistSession("next", state);

  expect(restarted.previousSourceItems.map((item) => item.queueItemId)).toEqual([
    "next:source:10:visit:1",
  ]);
});
