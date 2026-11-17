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
export const trackTupleKeys = [
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

export type TrackTupleKey = (typeof trackTupleKeys)[number];

type TrackTupleValue<Key extends TrackTupleKey> = Key extends "albumArtists"
  ? Track[Key] | null
  : Track[Key];

type TupleValues<Keys extends readonly TrackTupleKey[]> = {
  -readonly [Index in keyof Keys]: TrackTupleValue<Keys[Index]>;
};

export type TrackTuple = TupleValues<typeof trackTupleKeys>;

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

function trackFromTuple(track: TrackTuple) {
  const [
    addedAt,
    album,
    albumArtists,
    artists,
    artworkUrl,
    unavailableReason,
    bitrate,
    bitsPerSample,
    channelCount,
    codec,
    discNumber,
    discTotal,
    duration,
    format,
    genres,
    id,
    likedAt,
    lossless,
    title,
    sampleRate,
    trackNumber,
    trackTotal,
    year,
  ] = track;

  return {
    addedAt,
    album,
    albumArtists: albumArtists ?? artists,
    artists,
    artworkUrl,
    available: unavailableReason === null,
    bitrate,
    bitsPerSample,
    channelCount,
    codec,
    discNumber,
    discTotal,
    duration,
    format,
    genres,
    id,
    likedAt,
    lossless,
    title,
    sampleRate,
    trackNumber,
    trackTotal,
    unavailableReason,
    url: getTrackUrl(id),
    year,
  } satisfies Track;
}
