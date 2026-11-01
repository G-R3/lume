import { expect, it } from "vite-plus/test";
import type { Track } from "../shared/lib";
import type { TrackRow } from "../src/lib/track-sort";
import {
  captureSelectionInDisplayedOrder,
  createSelection,
  reduceSelection,
  type SelectionEvent,
  type SelectionState,
} from "../src/pages/tracks/track-selection";

const allTracks = { kind: "all-tracks" } as const;

function track(id: number, likedAt: number | null = null): Track {
  return {
    addedAt: id,
    album: null,
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
    duration: null,
    format: "flac",
    genres: [],
    id,
    likedAt,
    lossless: null,
    sampleRate: null,
    title: `Track ${id}`,
    trackNumber: null,
    trackTotal: null,
    url: `lume://track/${id}`,
    year: null,
  };
}

function rows(...ids: number[]): TrackRow[] {
  return ids.map((id) => ({ addedToListAt: id, sourceEntryId: id, track: track(id) }));
}

function run(state: SelectionState, ...events: SelectionEvent[]) {
  return events.reduce(reduceSelection, state);
}

function selected(state: SelectionState) {
  return [...state.selectedIds].sort((left, right) => left - right);
}

const click = (entryId: number, intent: "replace" | "toggle" | "range" = "replace") =>
  ({ entryId, intent, type: "click" }) as const;

it("selects the range between the anchor and each shift-click, not the previous range", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5, 6) }),
    click(3),
    click(5, "range"),
    click(2, "range"),
  );

  expect(selected(state)).toEqual([2, 3]);
  expect(state.anchorId).toBe(3);
  expect(state.focusedId).toBe(2);
});

it("toggles entries in and out and moves the anchor to the toggled entry", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5) }),
    click(1),
    click(4, "toggle"),
    click(1, "toggle"),
  );

  expect(selected(state)).toEqual([4]);
  expect(state.anchorId).toBe(1);

  expect(selected(reduceSelection(state, click(3, "range")))).toEqual([1, 2, 3]);
});

it("moves focus with arrows, selecting one row, and extends from the anchor with shift", () => {
  const navigate = (fromEntryId: number, key: "ArrowUp" | "ArrowDown", extend: boolean) =>
    ({ extend, fromEntryId, key, pageSize: 10, type: "navigate" }) as const;

  const start = run(createSelection({ context: allTracks, rows: rows(1, 2, 3, 4) }), click(2));
  const moved = reduceSelection(start, navigate(2, "ArrowDown", false));

  expect(selected(moved)).toEqual([3]);
  expect(moved.focusedId).toBe(3);

  const extended = run(moved, navigate(3, "ArrowDown", true), navigate(4, "ArrowDown", true));

  expect(selected(extended)).toEqual([3, 4]);
  expect(extended.focusedId).toBe(4);

  const reversed = run(extended, navigate(4, "ArrowUp", true), navigate(3, "ArrowUp", true));

  expect(selected(reversed)).toEqual([2, 3]);
  expect(reversed.anchorId).toBe(3);
});

it("selects every row of a large list, including rows far outside any mounted window", () => {
  const ids = Array.from({ length: 40_000 }, (_, index) => index + 1);

  const state = reduceSelection(createSelection({ context: allTracks, rows: rows(...ids) }), {
    type: "selectAll",
  });

  expect(state.selectedIds.size).toBe(40_000);
  expect(state.selectedIds.has(39_999)).toBe(true);

  const cleared = reduceSelection(state, { type: "clear" });

  expect(cleared.selectedIds.size).toBe(0);
});

it("drops selected entries a filter hides, and they stay dropped when the filter clears", () => {
  const all = rows(1, 2, 3, 4, 5);

  const state = run(
    createSelection({ context: allTracks, rows: all }),
    click(1),
    click(4, "range"),
    { type: "viewChanged", view: { context: allTracks, rows: rows(2, 4, 5) } },
    { type: "viewChanged", view: { context: allTracks, rows: all } },
  );

  expect(selected(state)).toEqual([2, 4]);
});

it("keeps the selection and anchor across a sort, and ranges follow the new order", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5) }),
    click(2),
    click(3, "range"),
    { type: "viewChanged", view: { context: allTracks, rows: rows(5, 4, 3, 2, 1) } },
  );

  expect(selected(state)).toEqual([2, 3]);
  expect(state.anchorId).toBe(2);

  expect(selected(reduceSelection(state, click(4, "range")))).toEqual([2, 3, 4]);
});

it("repairs focus to the next survivor, then the previous one, without selecting it", () => {
  const focused = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5) }),
    click(3),
    { type: "viewChanged", view: { context: allTracks, rows: rows(1, 2, 4, 5) } },
  );

  expect(focused.focusedId).toBe(4);
  expect(selected(focused)).toEqual([]);

  const atEnd = run(focused, click(5), {
    type: "viewChanged",
    view: { context: allTracks, rows: rows(1, 2, 4) },
  });

  expect(atEnd.focusedId).toBe(4);

  const replaced = reduceSelection(atEnd, {
    type: "viewChanged",
    view: { context: allTracks, rows: rows(8, 9) },
  });

  expect(replaced.focusedId).toBe(8);
});

it("starts empty when the list context changes, even when entry ids collide", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3) }),
    click(1),
    click(3, "range"),
    {
      type: "viewChanged",
      view: { context: { kind: "playlist", playlistId: 7 }, rows: rows(1, 2, 3) },
    },
  );

  expect(selected(state)).toEqual([]);
  expect(state.focusedId).toBeNull();
  expect(state.anchorId).toBeNull();
});

it("captures the selection in displayed order with repeated tracks kept as separate entries", () => {
  const playlist = { kind: "playlist", playlistId: 7 } as const;

  const entries: TrackRow[] = [
    { addedToListAt: 1, sourceEntryId: 30, track: track(2, 100) },
    { addedToListAt: 2, sourceEntryId: 10, track: track(1) },
    { addedToListAt: 3, sourceEntryId: 20, track: track(2, 100) },
  ];

  const empty = createSelection({ context: playlist, rows: entries });

  expect(captureSelectionInDisplayedOrder(empty)).toBeNull();

  const state = run(empty, click(20), click(30, "toggle"));

  expect(captureSelectionInDisplayedOrder(state)).toEqual({
    context: playlist,
    entries: [
      { liked: true, sourceEntryId: 30, title: "Track 2", trackId: 2 },
      { liked: true, sourceEntryId: 20, title: "Track 2", trackId: 2 },
    ],
  });
});
