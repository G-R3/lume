import { expect, it } from "vite-plus/test";
import type { Track } from "../shared/lib";
import type { TrackRow } from "../src/lib/track-sort";
import {
  captureSelectionInDisplayedOrder,
  createSelection,
  reduceSelection,
  type SelectionEvent,
  type SelectionState,
  summarizeSelection,
} from "../src/components/track-list/selection/track-selection";

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
  expect(state.focusedId).toBe(2);
});

it("keeps earlier selections when a shift-click extends from a command-clicked anchor", () => {
  const view = { context: allTracks, rows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) };
  const ranged = run(createSelection(view), click(9), click(7, "range"));

  expect(selected(ranged)).toEqual([7, 8, 9]);

  const added = reduceSelection(ranged, click(5, "toggle"));

  expect(selected(added)).toEqual([5, 7, 8, 9]);

  const second = reduceSelection(added, click(2, "range"));

  expect(selected(second)).toEqual([2, 3, 4, 5, 7, 8, 9]);

  const shrunk = reduceSelection(second, click(4, "range"));

  expect(selected(shrunk)).toEqual([4, 5, 7, 8, 9]);
  expect(selected(reduceSelection(shrunk, click(10, "range")))).toEqual([5, 6, 7, 8, 9, 10]);
});

it("extends with shift and arrows from a command-clicked anchor without touching earlier ranges", () => {
  const up = (fromEntryId: number) =>
    ({ extend: true, fromEntryId, key: "ArrowUp", pageSize: 10, type: "navigate" }) as const;

  const down = (fromEntryId: number) =>
    ({ extend: true, fromEntryId, key: "ArrowDown", pageSize: 10, type: "navigate" }) as const;

  const view = { context: allTracks, rows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) };
  const start = run(createSelection(view), click(9), click(7, "range"), click(5, "toggle"));
  const extended = run(start, up(5), up(4), up(3));

  expect(selected(extended)).toEqual([2, 3, 4, 5, 7, 8, 9]);
  expect(extended.focusedId).toBe(2);

  const shrunk = run(extended, down(2), down(3));

  expect(selected(shrunk)).toEqual([4, 5, 7, 8, 9]);
});

const lettered = { context: allTracks, rows: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) };

const [A, B, C, D, E, F, G, H, I] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

it("merges a range that reaches an earlier range, so the next shift-click replaces the merged run", () => {
  const ranges = run(
    createSelection(lettered),
    click(A),
    click(C, "range"),
    click(E, "toggle"),
    click(G, "range"),
  );

  expect(selected(ranges)).toEqual([A, B, C, E, F, G]);

  const merged = reduceSelection(ranges, click(A, "range"));

  expect(selected(merged)).toEqual([A, B, C, D, E]);
  expect(selected(reduceSelection(merged, click(G, "range")))).toEqual([E, F, G]);
  expect(selected(reduceSelection(merged, click(I, "range")))).toEqual([E, F, G, H, I]);
});

it("merges ranges the same way when extending with shift and arrows", () => {
  const extend = (fromEntryId: number, key: "ArrowUp" | "ArrowDown") =>
    ({ extend: true, fromEntryId, key, pageSize: 10, type: "navigate" }) as const;

  const ranges = run(
    createSelection(lettered),
    click(A),
    extend(A, "ArrowDown"),
    extend(B, "ArrowDown"),
    click(E, "toggle"),
    extend(E, "ArrowDown"),
    extend(F, "ArrowDown"),
  );

  expect(selected(ranges)).toEqual([A, B, C, E, F, G]);

  const merged = run(ranges, extend(G, "ArrowUp"), extend(F, "ArrowUp"), extend(E, "ArrowUp"));

  expect(selected(merged)).toEqual([A, B, C, D, E]);
  expect(merged.focusedId).toBe(D);

  const replaced = run(merged, extend(D, "ArrowDown"), extend(E, "ArrowDown"));

  expect(selected(replaced)).toEqual([E, F]);
});

it("selects the anchor again when a range starts from a command-click that deselected it", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5, 6) }),
    click(1),
    click(3, "toggle"),
    click(3, "toggle"),
    click(5, "range"),
  );

  expect(selected(state)).toEqual([1, 3, 4, 5]);
});

it("forgets earlier ranges after a plain click, select all or clear", () => {
  const view = { context: allTracks, rows: rows(1, 2, 3, 4, 5, 6, 7, 8) };
  const multi = run(createSelection(view), click(7), click(8, "range"), click(2, "toggle"));

  expect(selected(reduceSelection(multi, click(3, "range")))).toEqual([2, 3, 7, 8]);
  expect(selected(run(multi, click(4), click(5, "range")))).toEqual([4, 5]);

  const afterAll = run(multi, { type: "selectAll" }, click(3, "range"));

  expect(selected(afterAll)).toEqual([2, 3]);

  const afterClear = run(multi, { type: "clear" }, click(4, "range"));

  expect(selected(afterClear)).toEqual([4]);
});

it("starts a Shift-click from the clicked row once nothing is selected", () => {
  const view = { context: allTracks, rows: rows(1, 2, 3, 4, 5, 6) };
  const cleared = run(createSelection(view), click(2), { type: "clear" }, click(5, "range"));

  expect(selected(cleared)).toEqual([5]);

  const toggledOff = run(createSelection(view), click(2), click(2, "toggle"), click(5, "range"));

  expect(selected(toggledOff)).toEqual([5]);
});

it("drops hidden rows from an anchor's earlier selection when the view changes", () => {
  const all = rows(1, 2, 3, 4, 5, 6);

  const state = run(
    createSelection({ context: allTracks, rows: all }),
    click(1),
    click(2, "range"),
    click(5, "toggle"),
    { type: "viewChanged", view: { context: allTracks, rows: rows(2, 3, 4, 5, 6) } },
    { type: "viewChanged", view: { context: allTracks, rows: all } },
    click(6, "range"),
  );

  expect(selected(state)).toEqual([2, 5, 6]);
});

it("toggles entries in and out and moves the anchor to the toggled entry", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4, 5) }),
    click(1),
    click(4, "toggle"),
    click(1, "toggle"),
  );

  expect(selected(state)).toEqual([4]);

  expect(selected(reduceSelection(state, click(3, "range")))).toEqual([1, 2, 3, 4]);
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
  expect(reversed.focusedId).toBe(2);
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
  expect(selected(reduceSelection(state, click(2, "range")))).toEqual([2]);
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
      { artworkUrl: null, liked: true, sourceEntryId: 30, title: "Track 2", trackId: 2 },
      { artworkUrl: null, liked: true, sourceEntryId: 20, title: "Track 2", trackId: 2 },
    ],
  });
});

const openMenu = (entryId: number, trigger: "context" | "overflow" = "context") =>
  ({ entryId, focusToken: Symbol("row menu"), trigger, type: "openMenu" }) as const;

const targetIds = (state: SelectionState) =>
  state.menu?.target.entries.map((entry) => entry.sourceEntryId);

it("targets the whole selection in displayed order when a menu opens inside it", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4) }),
    click(4),
    click(2, "toggle"),
    openMenu(4),
  );

  expect(targetIds(state)).toEqual([2, 4]);
  expect(state.menu).toMatchObject({
    entryId: 4,
    namesTarget: false,
    open: true,
    targetsSelection: true,
  });
});

it("targets only the row when a menu opens outside the selection, and keeps the selection", () => {
  const state = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3, 4) }),
    click(1),
    click(2, "range"),
    openMenu(4, "overflow"),
  );

  expect(targetIds(state)).toEqual([4]);
  expect(state.menu).toMatchObject({
    namesTarget: true,
    targetsSelection: false,
    trigger: "overflow",
  });
  expect(selected(state)).toEqual([1, 2]);
  expect(state.focusedId).toBe(2);
});

it("keeps the captured target while the selection, sort and likes change underneath", () => {
  const opened = run(
    createSelection({ context: allTracks, rows: rows(1, 2, 3) }),
    click(1),
    click(3, "range"),
    openMenu(2),
  );

  const changed = run(opened, click(3), {
    type: "viewChanged",
    view: {
      context: allTracks,
      rows: [3, 2, 1].map((id) => ({ addedToListAt: id, sourceEntryId: id, track: track(id, 9) })),
    },
  });

  expect(targetIds(changed)).toEqual([1, 2, 3]);
  expect(changed.menu?.target.entries.every((entry) => !entry.liked)).toBe(true);
});

it("closes only the menu that is open, and forgets it when its row leaves the list", () => {
  const opened = run(createSelection({ context: allTracks, rows: rows(1, 2, 3) }), openMenu(2));

  expect(opened.menu).toMatchObject({ namesTarget: false, targetsSelection: false });

  expect(reduceSelection(opened, { entryId: 1, trigger: "context", type: "closeMenu" })).toBe(
    opened,
  );
  expect(reduceSelection(opened, { entryId: 2, trigger: "overflow", type: "closeMenu" })).toBe(
    opened,
  );

  const closed = reduceSelection(opened, { entryId: 2, trigger: "context", type: "closeMenu" });

  expect(closed.menu).toMatchObject({ entryId: 2, open: false });
  expect(targetIds(closed)).toEqual([2]);

  const removed = reduceSelection(closed, {
    type: "viewChanged",
    view: { context: allTracks, rows: rows(1, 3) },
  });

  expect(removed.menu).toBeNull();
});

it("summarizes the count, total duration and liked state of the selected rows only", () => {
  const view = {
    context: allTracks,
    rows: [
      { addedToListAt: 1, sourceEntryId: 1, track: { ...track(1, 10), duration: 61.5 } },
      { addedToListAt: 2, sourceEntryId: 2, track: { ...track(2, 20), duration: 120 } },
      { addedToListAt: 3, sourceEntryId: 3, track: { ...track(3), duration: null } },
      { addedToListAt: 4, sourceEntryId: 4, track: { ...track(4), duration: 999 } },
    ],
  };

  const likedPair = run(createSelection(view), click(1), click(2, "range"));

  expect(summarizeSelection(likedPair)).toEqual({ allLiked: true, count: 2, duration: 181.5 });

  expect(summarizeSelection(run(likedPair, click(3, "toggle")))).toEqual({
    allLiked: false,
    count: 3,
    duration: 181.5,
  });

  expect(summarizeSelection(createSelection(view))).toEqual({
    allLiked: true,
    count: 0,
    duration: 0,
  });
});
