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

const sortsInMemory = new Map<string, TrackSort>();

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
  const known = sortsInMemory.get(key);

  if (known) return known;

  let stored: string | null = null;

  try {
    stored = globalThis.localStorage?.getItem(key) ?? null;
  } catch {}

  const sort = parseTrackSort(stored);
  sortsInMemory.set(key, sort);

  return sort;
}

function writeSort(key: string, sort: TrackSort) {
  if (sortsInMemory.get(key) === sort) return;

  sortsInMemory.set(key, sort);

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

  return [sort, (field: SortField) => stepSort(key, field)] as const;
}
