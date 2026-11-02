import { useState } from "react";
import type { SourceIdentity } from "../../lib/queue/model";
import { sameSource } from "../../lib/queue/source";
import type { TrackRow } from "../../lib/track-sort";

export type CompleteSelectionView = {
  readonly context: SourceIdentity;
  readonly rows: readonly TrackRow[];
};

export type SelectionState = {
  readonly view: CompleteSelectionView;
  readonly indexById: ReadonlyMap<number, number>;
  readonly selectedIds: ReadonlySet<number>;
  readonly anchor: SelectionAnchor | null;
  readonly focusedId: number | null;
  readonly menu: RowMenu | null;
};

export type SelectionAnchor = {
  readonly id: number;
  readonly base: ReadonlySet<number>;
};

export type RowMenuTrigger = "context" | "overflow";

export type RowMenu = {
  readonly entryId: number;
  readonly focusToken: symbol;
  readonly trigger: RowMenuTrigger;
  readonly open: boolean;
  readonly target: ActionTarget;
  readonly targetsSelection: boolean;
  readonly namesTarget: boolean;
};

export type NavigationKey = "ArrowUp" | "ArrowDown" | "Home" | "End" | "PageUp" | "PageDown";

export type SelectionEvent =
  | { type: "viewChanged"; view: CompleteSelectionView }
  | { type: "click"; entryId: number; intent: "replace" | "toggle" | "range" }
  | {
      type: "navigate";
      fromEntryId: number;
      key: NavigationKey;
      pageSize: number;
      extend: boolean;
    }
  | { type: "selectAll" }
  | { type: "clear" }
  | { type: "openMenu"; entryId: number; trigger: RowMenuTrigger; focusToken: symbol }
  | { type: "closeMenu"; entryId: number; trigger: RowMenuTrigger };

export type TargetEntry = {
  readonly sourceEntryId: number;
  readonly trackId: number;
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly liked: boolean;
};

export type ActionTarget = {
  readonly context: SourceIdentity;
  readonly entries: readonly [TargetEntry, ...TargetEntry[]];
};

export function createSelection(view: CompleteSelectionView): SelectionState {
  return {
    anchor: null,
    focusedId: null,
    indexById: indexRows(view.rows),
    menu: null,
    selectedIds: new Set(),
    view,
  };
}

export function reduceSelection(state: SelectionState, event: SelectionEvent): SelectionState {
  switch (event.type) {
    case "viewChanged":
      return sameSource(state.view.context, event.view.context)
        ? changeView(state, event.view)
        : createSelection(event.view);
    case "click":
      if (!state.indexById.has(event.entryId)) return state;

      if (event.intent === "toggle") return toggle(state, event.entryId);

      if (event.intent === "range") return extendTo(state, event.entryId, event.entryId);

      return selectOnly(state, event.entryId);
    case "navigate": {
      const from = state.indexById.get(event.fromEntryId);
      const rows = state.view.rows;

      if (from === undefined || rows.length === 0) return state;

      const target = {
        ArrowDown: from + 1,
        ArrowUp: from - 1,
        End: rows.length - 1,
        Home: 0,
        PageDown: from + event.pageSize,
        PageUp: from - event.pageSize,
      }[event.key];

      const entryId = rows[Math.max(0, Math.min(rows.length - 1, target))].sourceEntryId;

      return event.extend
        ? extendTo(state, entryId, event.fromEntryId)
        : selectOnly(state, entryId);
    }

    case "selectAll": {
      const anchorId =
        state.anchor?.id ?? state.focusedId ?? state.view.rows[0]?.sourceEntryId ?? null;

      return {
        ...state,
        anchor: anchorAt(anchorId),
        selectedIds: new Set(state.view.rows.map((row) => row.sourceEntryId)),
      };
    }

    case "clear":
      if (state.selectedIds.size === 0) return state;

      return { ...state, anchor: null, selectedIds: new Set() };
    case "openMenu": {
      const index = state.indexById.get(event.entryId);

      if (index === undefined) return state;

      const targetsSelection = state.selectedIds.has(event.entryId);
      const selection = targetsSelection ? captureSelectionInDisplayedOrder(state) : null;

      const target =
        selection ??
        Object.freeze({
          context: state.view.context,
          entries: [targetEntryOf(state.view.rows[index])] as const,
        });

      return {
        ...state,
        menu: {
          entryId: event.entryId,
          focusToken: event.focusToken,
          namesTarget: !targetsSelection && state.selectedIds.size > 0,
          open: true,
          target,
          targetsSelection,
          trigger: event.trigger,
        },
      };
    }

    case "closeMenu":
      if (
        state.menu?.entryId !== event.entryId ||
        state.menu.trigger !== event.trigger ||
        !state.menu.open
      ) {
        return state;
      }

      return { ...state, menu: { ...state.menu, open: false } };
  }
}

export function useTrackSelection(view: CompleteSelectionView) {
  const [state, setState] = useState(() => createSelection(view));
  let current = state;

  if (state.view.rows !== view.rows || !sameSource(state.view.context, view.context)) {
    current = reduceSelection(state, { type: "viewChanged", view });
    setState(current);
  }

  const dispatch = (event: SelectionEvent) => setState((latest) => reduceSelection(latest, event));

  return [current, dispatch] as const;
}

export function captureSelectionInDisplayedOrder(state: SelectionState): ActionTarget | null {
  const entries = state.view.rows
    .filter((row) => state.selectedIds.has(row.sourceEntryId))
    .map(targetEntryOf);

  const [first, ...rest] = entries;

  return first ? Object.freeze({ context: state.view.context, entries: [first, ...rest] }) : null;
}

export function summarizeSelection(state: SelectionState) {
  let duration = 0;
  let allLiked = true;

  for (const entryId of state.selectedIds) {
    const track = state.view.rows[state.indexById.get(entryId) ?? -1]?.track;

    if (!track) continue;

    duration += track.duration ?? 0;
    allLiked &&= track.likedAt !== null;
  }

  return { allLiked, count: state.selectedIds.size, duration };
}

function targetEntryOf(row: TrackRow): TargetEntry {
  return {
    artworkUrl: row.track.artworkUrl,
    liked: row.track.likedAt !== null,
    sourceEntryId: row.sourceEntryId,
    title: row.track.title,
    trackId: row.track.id,
  };
}

function indexRows(rows: readonly TrackRow[]) {
  return new Map(rows.map((row, index) => [row.sourceEntryId, index]));
}

function anchorAt(id: number | null, base: ReadonlySet<number> = new Set()) {
  return id === null ? null : { base, id };
}

function selectOnly(state: SelectionState, entryId: number): SelectionState {
  return {
    ...state,
    anchor: anchorAt(entryId),
    focusedId: entryId,
    selectedIds: new Set([entryId]),
  };
}

function toggle(state: SelectionState, entryId: number): SelectionState {
  const selectedIds = new Set(state.selectedIds);

  if (!selectedIds.delete(entryId)) selectedIds.add(entryId);

  return {
    ...state,
    anchor: selectedIds.size > 0 ? anchorAt(entryId, selectedIds) : null,
    focusedId: entryId,
    selectedIds,
  };
}

function extendTo(
  state: SelectionState,
  entryId: number,
  fallbackAnchorId: number,
): SelectionState {
  const anchor = state.anchor ?? {
    base: new Set<number>(),
    id: fallbackAnchorId,
  };

  const rows = state.view.rows;
  const from = state.indexById.get(anchor.id) ?? 0;
  const to = state.indexById.get(entryId) ?? from;
  let start = Math.min(from, to);
  let end = Math.max(from, to);

  const selectedIds = new Set([
    ...anchor.base,
    ...rows.slice(start, end + 1).map((row) => row.sourceEntryId),
  ]);

  while (start > 0 && selectedIds.has(rows[start - 1].sourceEntryId)) start--;

  while (end < rows.length - 1 && selectedIds.has(rows[end + 1].sourceEntryId)) end++;

  // An earlier range the new one touches merges into the anchor's range, so the next extend
  // from this anchor replaces the merged run instead of keeping it.
  const anchorRun = new Set(rows.slice(start, end + 1).map((row) => row.sourceEntryId));

  return {
    ...state,
    anchor: { base: new Set([...anchor.base].filter((id) => !anchorRun.has(id))), id: anchor.id },
    focusedId: entryId,
    selectedIds,
  };
}

function changeView(state: SelectionState, view: CompleteSelectionView): SelectionState {
  const indexById = indexRows(view.rows);
  const selectedIds = new Set([...state.selectedIds].filter((id) => indexById.has(id)));
  const keep = (id: number | null) => (id !== null && indexById.has(id) ? id : null);
  const anchor = state.anchor && indexById.has(state.anchor.id) ? state.anchor : null;

  return {
    anchor: anchor && {
      base: new Set([...anchor.base].filter((id) => indexById.has(id))),
      id: anchor.id,
    },
    focusedId: keep(state.focusedId) ?? survivorOf(state, indexById, view),
    indexById,
    menu: state.menu && indexById.has(state.menu.entryId) ? state.menu : null,
    selectedIds: selectedIds.size === state.selectedIds.size ? state.selectedIds : selectedIds,
    view,
  };
}

function survivorOf(
  state: SelectionState,
  indexById: ReadonlyMap<number, number>,
  view: CompleteSelectionView,
) {
  if (state.focusedId === null) return null;

  const oldRows = state.view.rows;
  const from = state.indexById.get(state.focusedId) ?? 0;

  for (let index = from + 1; index < oldRows.length; index++) {
    if (indexById.has(oldRows[index].sourceEntryId)) return oldRows[index].sourceEntryId;
  }

  for (let index = from - 1; index >= 0; index--) {
    if (indexById.has(oldRows[index].sourceEntryId)) return oldRows[index].sourceEntryId;
  }

  return view.rows[0]?.sourceEntryId ?? null;
}
