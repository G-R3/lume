import { useSyncExternalStore } from "react";
import type { SourceIdentity } from "./queue/model";
import {
  defaultSort,
  dropSortSlots,
  formatTrackSort,
  nextSort,
  parseTrackSort,
  type SortField,
  type TrackSort,
} from "./track-sort";

// Read once per key, then kept here, so a failing localStorage still sorts for the session.
const sorts = new Map<string, TrackSort>();

const listeners = new Map<string, Set<() => void>>();

try {
  globalThis.localStorage?.removeItem("lume:track-sort");
} catch {}

function storageKey(view: SourceIdentity) {
  return view.kind === "all-tracks"
    ? "lume:sort:all-tracks"
    : `lume:sort:playlist:${view.playlistId}`;
}

function readSort(key: string) {
  const known = sorts.get(key);

  if (known) return known;

  let stored: string | null = null;

  try {
    stored = globalThis.localStorage?.getItem(key) ?? null;
  } catch {}

  const sort = parseTrackSort(stored);
  sorts.set(key, sort);

  return sort;
}

function writeSort(key: string, sort: TrackSort) {
  if (sorts.get(key) === sort) return;

  sorts.set(key, sort);

  try {
    if (sort === defaultSort) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, formatTrackSort(sort));
  } catch {}

  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribe(key: string, listener: () => void) {
  const keyListeners = listeners.get(key) ?? new Set();
  listeners.set(key, keyListeners);
  keyListeners.add(listener);

  return () => {
    keyListeners.delete(listener);
  };
}

export function getViewSort(view: SourceIdentity) {
  return readSort(storageKey(view));
}

/** Steps the view's sort from its latest value, so two quick clicks step twice. */
export function stepViewSort(view: SourceIdentity, field: SortField) {
  stepSort(storageKey(view), field);
}

function stepSort(key: string, field: SortField) {
  writeSort(key, nextSort(readSort(key), field));
}

export function forgetViewSort(view: SourceIdentity) {
  writeSort(storageKey(view), defaultSort);
  dropSortSlots(view);
}

export function useViewSort(view: SourceIdentity) {
  const key = storageKey(view);

  const sort = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => readSort(key),
  );

  const sortBy = (field: SortField) => stepSort(key, field);

  return [sort, sortBy] as const;
}
