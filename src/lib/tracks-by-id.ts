import type { Track } from "@shared/library";

const tracksByIdCache = new WeakMap<readonly Track[], ReadonlyMap<number, Track>>();

export function getTracksById(tracks: readonly Track[]): ReadonlyMap<number, Track> {
  const cached = tracksByIdCache.get(tracks);

  if (cached) return cached;

  const index = new Map(tracks.map((track) => [track.id, track]));
  tracksByIdCache.set(tracks, index);

  return index;
}
