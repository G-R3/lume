import type { Track } from "@shared/library";

const trackIndexCache = new WeakMap<readonly Track[], ReadonlyMap<number, Track>>();

export function trackIndex(tracks: readonly Track[]): ReadonlyMap<number, Track> {
  const cached = trackIndexCache.get(tracks);

  if (cached) return cached;

  const index = new Map(tracks.map((track) => [track.id, track]));
  trackIndexCache.set(tracks, index);

  return index;
}
