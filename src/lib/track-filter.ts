import type { Track } from "../../shared/lib";

export type TrackFilter = {
  readonly normalizedText: string;
  readonly terms: readonly string[];
  readonly text: string;
};

const searchKeys = new WeakMap<Track, string>();

// Only the Latin combining block, then recomposed: kana voicing marks are combining marks too, and
// left decomposed, "か" would match inside "が".
const diacritics = /[\u0300-\u036f]/g;

function normalize(text: string) {
  return text.normalize("NFD").replace(diacritics, "").normalize("NFC").toLowerCase();
}

function searchKeyOf(track: Track) {
  const cached = searchKeys.get(track);

  if (cached !== undefined) return cached;

  const key = normalize([track.title, ...track.artists, track.album ?? ""].join("\n"));
  searchKeys.set(track, key);

  return key;
}

export function parseTrackFilter(text: string): TrackFilter | null {
  const trimmed = text.trim();

  if (!trimmed) return null;

  const terms = normalize(trimmed).split(/\s+/);

  return { normalizedText: terms.join(" "), terms, text: trimmed };
}

export function matchesTrackFilter(track: Track, filter: TrackFilter) {
  const key = searchKeyOf(track);

  return filter.terms.every((term) => key.includes(term));
}
