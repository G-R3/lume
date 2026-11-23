import type {
  FirstRunLibrary,
  LibrarySnapshot,
  LibrarySource,
  LibraryState,
  PlaylistSummary,
  Track,
} from "./library";
import { getTrackUrl } from "./app-urls";

// The library as a JSON string. This is what main sends to the renderer.
export type LibrarySnapshotJson = string;

// the field order of each track tuple in the library JSON string
// index 0 is addedAt, index 1 is album, and so on
export const TRACK_TUPLE_KEYS = [
  "addedAt",
  "album",
  "albumArtists",
  "artists",
  "artworkUrl",
  "unavailableReason",
  "bitrate",
  "bitsPerSample",
  "channelCount",
  "codec",
  "discNumber",
  "discTotal",
  "duration",
  "format",
  "genres",
  "id",
  "likedAt",
  "lossless",
  "title",
  "sampleRate",
  "trackNumber",
  "trackTotal",
  "year",
] as const satisfies readonly Exclude<keyof Track, "url" | "available">[];

export type TrackTupleKey = (typeof TRACK_TUPLE_KEYS)[number];

type TuplePositions<Keys extends readonly string[]> = {
  [Index in keyof Keys as Index extends `${number}`
    ? Keys[Index]
    : never]: Index extends `${infer Position extends number}` ? Position : never;
};

// SAFETY: Object.fromEntries returns an untyped record. It holds the index of every key in TRACK_TUPLE_KEYS.
export const TRACK_TUPLE_POSITIONS = Object.fromEntries(
  TRACK_TUPLE_KEYS.map((key, index) => [key, index]),
) as TuplePositions<typeof TRACK_TUPLE_KEYS>;

type TrackTupleValue<Key extends TrackTupleKey> = Key extends "albumArtists"
  ? Track[Key] | null
  : Track[Key];

type TupleValues<Keys extends readonly TrackTupleKey[]> = {
  -readonly [Index in keyof Keys]: TrackTupleValue<Keys[Index]>;
};

export type TrackTuple = TupleValues<typeof TRACK_TUPLE_KEYS>;

export type TrackTupleFields = { [Key in TrackTupleKey]: TrackTupleValue<Key> };

export function toTrackTuple(fields: TrackTupleFields): TrackTuple {
  // SAFETY: Array.map returns a plain array. It keeps the order of TRACK_TUPLE_KEYS, which defines TrackTuple.
  return TRACK_TUPLE_KEYS.map((key) => fields[key]) as TrackTuple;
}

type LibraryWithTrackTuples = LibraryState &
  (
    | FirstRunLibrary
    | {
        kind: "library";
        playlists: PlaylistSummary[];
        sources: LibrarySource[];
        tracks: TrackTuple[];
      }
  );

export function stringifyFirstRunLibrary({ revision, scans }: LibraryState): LibrarySnapshotJson {
  return JSON.stringify({ kind: "first-run", revision, scans } satisfies LibrarySnapshot);
}

export function stringifyLibrary(
  { revision, scans }: LibraryState,
  playlists: PlaylistSummary[],
  sources: LibrarySource[],
  tracks: TrackTuple[],
): LibrarySnapshotJson {
  const library = {
    kind: "library",
    playlists,
    revision,
    scans,
    sources,
    tracks,
  } satisfies LibraryWithTrackTuples;

  return JSON.stringify(library);
}

export function albumArtistsIfDifferent(albumArtists: string[], artists: string[]) {
  if (albumArtists.length !== artists.length) return albumArtists;

  for (let index = 0; index < artists.length; index += 1) {
    if (albumArtists[index] !== artists[index]) return albumArtists;
  }

  return null;
}

// Turns the library string back into objects. The rest of the app only sees tracks as objects.
export function parseLibrarySnapshot(json: LibrarySnapshotJson): LibrarySnapshot {
  // SAFETY: JSON.parse returns an untyped value.
  // Only the two stringify functions above write this text.
  // Main and renderer ship in one bundle, so both sides agree on the track tuple layout.
  const library = JSON.parse(json) as LibraryWithTrackTuples;

  if (library.kind === "first-run") return library;

  // Clear each tuple after expanding it. this lowers peak memory on large libraries
  const trackTuples = library.tracks;
  const releasedTracks: (TrackTuple | null)[] = trackTuples;
  const tracks: Track[] = [];

  for (let index = 0; index < trackTuples.length; index += 1) {
    tracks.push(trackFromTuple(trackTuples[index]));
    releasedTracks[index] = null;
  }

  return {
    kind: "library",
    playlists: library.playlists,
    revision: library.revision,
    scans: library.scans,
    sources: library.sources,
    tracks,
  };
}

function trackFromTuple(tuple: TrackTuple) {
  const at = TRACK_TUPLE_POSITIONS;
  const artists = tuple[at.artists];
  const id = tuple[at.id];
  const unavailableReason = tuple[at.unavailableReason];

  return {
    addedAt: tuple[at.addedAt],
    album: tuple[at.album],
    albumArtists: tuple[at.albumArtists] ?? artists,
    artists,
    artworkUrl: tuple[at.artworkUrl],
    available: unavailableReason === null,
    bitrate: tuple[at.bitrate],
    bitsPerSample: tuple[at.bitsPerSample],
    channelCount: tuple[at.channelCount],
    codec: tuple[at.codec],
    discNumber: tuple[at.discNumber],
    discTotal: tuple[at.discTotal],
    duration: tuple[at.duration],
    format: tuple[at.format],
    genres: tuple[at.genres],
    id,
    likedAt: tuple[at.likedAt],
    lossless: tuple[at.lossless],
    title: tuple[at.title],
    sampleRate: tuple[at.sampleRate],
    trackNumber: tuple[at.trackNumber],
    trackTotal: tuple[at.trackTotal],
    unavailableReason,
    url: getTrackUrl(id),
    year: tuple[at.year],
  } satisfies Track;
}
