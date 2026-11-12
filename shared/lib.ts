export type TrackMetadata = {
  album: string | null;
  albumArtists: string[];
  artists: string[];
  bitrate: number | null;
  bitsPerSample: number | null;
  channelCount: number | null;
  codec: string | null;
  discNumber: number | null;
  discTotal: number | null;
  duration: number | null;
  format: string;
  genres: string[];
  lossless: boolean | null;
  title: string;
  sampleRate: number | null;
  trackNumber: number | null;
  trackTotal: number | null;
  year: number | null;
};

export type TrackUnavailableReason =
  | "source-forgotten"
  | "source-off"
  | "source-missing"
  | "source-permission"
  | "source-unreadable"
  | "file-missing";

export type Track = TrackMetadata & {
  addedAt: number;
  artworkUrl: string | null;
  available: boolean;
  unavailableReason: TrackUnavailableReason | null;
  id: number;
  url: string;
  likedAt: number | null;
};

export type SetTracksLikedInput = {
  liked: boolean;
  trackIds: readonly Track["id"][];
};

export type TrackLikeResult = {
  likedAt: Track["likedAt"];
  trackId: Track["id"];
};

/** Main numbers every library payload in the order it built them. A higher revision saw a newer database. */
export type LibraryRevision = number;

export type TracksLikedResult = {
  likes: TrackLikeResult[];
  revision: LibraryRevision;
};

export type SourceStatus =
  | { kind: "off" }
  | { kind: "unscanned" }
  | { kind: "scanned"; scannedAt: number; trackCount: number }
  | { kind: "missing" | "permission" | "failed"; lastScannedAt: number | null; errorMessage: string };

export type LibrarySource = { id: number; path: string; status: SourceStatus };

export type PlaylistSummary = {
  description: string | null;
  trackCount: number;
  id: number;
  title: string;
};

export type PlaylistCreationInput = {
  description: string | null;
  title: string;
  trackIds: readonly Track["id"][];
};

export type AddTracksToPlaylistInput = {
  /**
   * `check` writes nothing when any target is already in the playlist and reports the overlap.
   * `allow` appends every target. `skip` appends each target not already there, once.
   */
  duplicates: "check" | "allow" | "skip";
  playlistId: number;
  /** One entry per new membership, in order. A repeated ID adds that track again. */
  trackIds: readonly Track["id"][];
};

export type RemovePlaylistTracksInput = {
  playlistId: number;
  playlistTrackIds: readonly number[];
};

export type PlaylistTrack = {
  /** When the track joined this playlist (playlist_entries.created_at, epoch ms). */
  addedAt: number;
  id: number;
  position: number;
  trackId: number;
};

export type PlaylistDetails = {
  description: string | null;
  tracks: PlaylistTrack[];
  id: number;
  title: string;
};

export type AddTracksToPlaylistResult =
  | { kind: "added"; tracks: PlaylistTrack[] }
  | { kind: "duplicate"; alreadyInPlaylist: number; newTrackCount: number };

export type MusicLibrary = {
  kind: "library";
  playlists: PlaylistSummary[];
  sources: LibrarySource[];
  tracks: Track[];
};

export type FirstRunLibrary = { kind: "first-run" };

export type LibrarySnapshot = (MusicLibrary | FirstRunLibrary) & { revision: LibraryRevision };

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

type LibraryWithTrackTuples = { revision: LibraryRevision } & (
  | FirstRunLibrary
  | {
      kind: "library";
      playlists: PlaylistSummary[];
      sources: LibrarySource[];
      tracks: TrackTuple[];
    }
);

export function stringifyFirstRunLibrary(revision: LibraryRevision): LibrarySnapshotJson {
  return JSON.stringify({ kind: "first-run", revision } satisfies LibrarySnapshot);
}

export function stringifyLibrary(
  revision: LibraryRevision,
  playlists: PlaylistSummary[],
  sources: LibrarySource[],
  tracks: TrackTuple[],
): LibrarySnapshotJson {
  const library = {
    kind: "library",
    playlists,
    revision,
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

export type LibraryUpdate =
  | { kind: "snapshot"; library: LibrarySnapshotJson }
  | { kind: "sources"; revision: LibraryRevision; sources: LibrarySource[] };

export type SavedPlaybackSession = {
  payload: string;
  position: number;
};

export type PlaylistCreationResult = {
  library: LibrarySnapshotJson;
  playlist: PlaylistDetails;
};

export type LumeInvokeApi = {
  addSource: () => Promise<LibrarySnapshotJson>;
  addTracksToPlaylist: (input: AddTracksToPlaylistInput) => Promise<AddTracksToPlaylistResult>;
  awaitStartupScan: () => Promise<LibraryUpdate | null>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<PlaylistCreationResult>;
  deletePlaylist: (playlistId: number) => Promise<LibrarySnapshotJson>;
  disableSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  enableSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  forgetSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  hasTrackFile: (trackId: number) => Promise<boolean>;
  loadLibrary: () => Promise<LibrarySnapshotJson>;
  loadPlaybackSession: () => Promise<SavedPlaybackSession | null>;
  loadPlaylist: (playlistId: number) => Promise<PlaylistDetails | null>;
  openDataFolder: () => Promise<void>;
  removePlaylistTracks: (input: RemovePlaylistTracksInput) => Promise<void>;
  rescanSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  rescanSources: () => Promise<LibrarySnapshotJson>;
  savePlaybackPosition: (position: number) => Promise<void>;
  savePlaybackSession: (session: SavedPlaybackSession) => Promise<void>;
  setTracksLiked: (input: SetTracksLikedInput) => Promise<TracksLikedResult>;
};

type PlaybackSessionMethod = "loadPlaybackSession" | "savePlaybackPosition" | "savePlaybackSession";

export type LumeApi = Omit<LumeInvokeApi, PlaybackSessionMethod> & {
  playbackSession: {
    flush: (session: SavedPlaybackSession) => void;
    load: LumeInvokeApi["loadPlaybackSession"];
    save: LumeInvokeApi["savePlaybackSession"];
    savePosition: LumeInvokeApi["savePlaybackPosition"];
  };
  isMac: boolean;
};

// Electron includes the channel name in the error text the renderer shows for a failed call.
export const lumeChannels = {
  addSource: "lume:add-source",
  addTracksToPlaylist: "lume:add-tracks-to-playlist",
  awaitStartupScan: "lume:await-startup-scan",
  createPlaylist: "lume:create-playlist",
  deletePlaylist: "lume:delete-playlist",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  hasTrackFile: "lume:has-track-file",
  loadLibrary: "lume:load-library",
  loadPlaybackSession: "lume:load-playback-session",
  loadPlaylist: "lume:load-playlist",
  openDataFolder: "lume:open-data-folder",
  removePlaylistTracks: "lume:remove-playlist-tracks",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
  savePlaybackPosition: "lume:save-playback-position",
  savePlaybackSession: "lume:save-playback-session",
  setTracksLiked: "lume:set-tracks-liked",
} as const satisfies Record<keyof LumeInvokeApi, `lume:${string}`>;

export const lumeEventChannels = {
  flushPlaybackSession: "lume:flush-playback-session",
} as const;

export const appScheme = "lume";

export function getTrackUrl(id: number) {
  return `${appScheme}://app/media/${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${appScheme}://app/artwork/${encodeURIComponent(id)}`;
}
