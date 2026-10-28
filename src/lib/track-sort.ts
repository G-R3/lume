import { useSyncExternalStore } from "react";
import type { Track } from "../../shared/lib";

export const trackSorts = [
  { label: "Recently added", value: "added" },
  { label: "Title", value: "title" },
  { label: "Artist", value: "artist" },
  { label: "Album", value: "album" },
  { label: "Duration", value: "duration" },
] as const;

export type TrackSort = (typeof trackSorts)[number]["value"];

const storageKey = "lume:track-sort";

const defaultSort: TrackSort = "added";

const listeners = new Set<() => void>();

let currentSort = readStoredSort();

function readStoredSort(): TrackSort {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);

    return trackSorts.find((sort) => sort.value === stored)?.value ?? defaultSort;
  } catch {
    return defaultSort;
  }
}

export function getTrackSort() {
  return currentSort;
}

export function setTrackSort(sort: TrackSort) {
  if (sort === currentSort) return;
  currentSort = sort;

  try {
    globalThis.localStorage?.setItem(storageKey, sort);
  } catch {}

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function useTrackSort() {
  return useSyncExternalStore(subscribe, getTrackSort);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareText(left: string | null, right: string | null) {
  if (!left || !right) return Number(!left) - Number(!right);

  return collator.compare(left, right);
}

function compareNumber(left: number | null, right: number | null) {
  if (left === null || right === null) return Number(left === null) - Number(right === null);

  return left - right;
}

const compareTitle = (left: Track, right: Track) => compareText(left.title, right.title);

const compareAlbumOrder = (left: Track, right: Track) =>
  compareText(left.album, right.album) ||
  compareNumber(left.discNumber, right.discNumber) ||
  compareNumber(left.trackNumber, right.trackNumber) ||
  compareTitle(left, right);

const comparators: Record<Exclude<TrackSort, "title">, (left: Track, right: Track) => number> = {
  added: (left, right) => right.addedAt - left.addedAt || compareTitle(left, right),
  album: compareAlbumOrder,
  artist: (left, right) =>
    compareText(left.artists.join(", "), right.artists.join(", ")) ||
    compareAlbumOrder(left, right),
  duration: (left, right) =>
    compareNumber(left.duration, right.duration) || compareTitle(left, right),
};

const sortedTracks = new WeakMap<readonly Track[], Map<TrackSort, readonly Track[]>>();

export function sortTracks(tracks: readonly Track[], sort: TrackSort): readonly Track[] {
  if (sort === "title") return tracks;

  const cached = sortedTracks.get(tracks) ?? new Map<TrackSort, readonly Track[]>();
  sortedTracks.set(tracks, cached);

  const existing = cached.get(sort);

  if (existing) return existing;

  const sorted = tracks.toSorted(comparators[sort]);
  cached.set(sort, sorted);

  return sorted;
}
