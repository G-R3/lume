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

export type Track = TrackMetadata & {
  addedAt: number;
  artworkUrl: string | null;
  available: boolean;
  id: number;
  url: string;
  likedAt: number | null;
};

export type TrackLikeInput = {
  liked: boolean;
  trackId: Track["id"];
};

export type TrackLikeResult = {
  likedAt: Track["likedAt"];
  trackId: Track["id"];
};

export type LibrarySource = {
  enabled: boolean;
  id: number;
  lastScanError: string | null;
  lastScannedAt: number | null;
  path: string;
  trackCount: number;
};

export type PlaylistSummary = {
  description: string | null;
  trackCount: number;
  id: number;
  title: string;
};

export type PlaylistCreationInput = {
  description: string | null;
  title: string;
};

export type PlaylistTrackInput = {
  playlistId: number;
  trackId: number;
};

export type PlaylistTrackRemovalInput = {
  playlistId: number;
  playlistTrackId: number;
};

export type PlaylistTrack = {
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

export type AddTrackToPlaylistResult =
  | { kind: "added"; track: PlaylistTrack }
  | { kind: "duplicate" };

export type MusicLibrary = {
  kind: "library";
  playlists: PlaylistSummary[];
  sources: LibrarySource[];
  tracks: Track[];
};

export type LibrarySnapshot = MusicLibrary | { kind: "first-run" };

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
  "available",
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
] as const satisfies readonly Exclude<keyof Track, "url">[];

export type TrackTupleKey = (typeof trackTupleKeys)[number];

type TrackTupleValue<Key extends TrackTupleKey> = Key extends "albumArtists"
  ? Track[Key] | null
  : Track[Key];

type TupleValues<Keys extends readonly TrackTupleKey[]> = {
  -readonly [Index in keyof Keys]: TrackTupleValue<Keys[Index]>;
};

export type TrackTuple = TupleValues<typeof trackTupleKeys>;

type LibraryWithTrackTuples =
  | { kind: "first-run" }
  | {
      kind: "library";
      playlists: PlaylistSummary[];
      sources: LibrarySource[];
      tracks: TrackTuple[];
    };

export function stringifyFirstRunLibrary(): LibrarySnapshotJson {
  return JSON.stringify({ kind: "first-run" } satisfies LibrarySnapshot);
}

export function stringifyLibrary(
  playlists: PlaylistSummary[],
  sources: LibrarySource[],
  tracks: TrackTuple[],
): LibrarySnapshotJson {
  const library = {
    kind: "library",
    playlists,
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

  return { kind: "library", playlists: library.playlists, sources: library.sources, tracks };
}

function trackFromTuple(track: TrackTuple) {
  const [
    addedAt,
    album,
    albumArtists,
    artists,
    artworkUrl,
    available,
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
    available,
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
    url: getTrackUrl(id),
    year,
  } satisfies Track;
}

export function createBufferedListeners<Value>() {
  const listeners = new Set<(value: Value) => void>();
  let pending: Value | undefined;

  return {
    publish: (value: Value) => {
      if (listeners.size === 0) {
        pending = value;

        return;
      }

      listeners.forEach((listener) => listener(value));
    },
    subscribe: (listener: (value: Value) => void) => {
      listeners.add(listener);

      if (pending !== undefined) {
        listener(pending);
        pending = undefined;
      }

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type LibraryUpdate =
  | { kind: "snapshot"; library: LibrarySnapshotJson }
  | { kind: "sources"; sources: LibrarySource[] };

export type SavedPlaybackSession = {
  payload: string;
  position: number;
};

export type PlaylistCreationResult = {
  library: LibrarySnapshotJson;
  playlist: PlaylistSummary;
};

export type LumeInvokeApi = {
  addTrackToPlaylist: (input: PlaylistTrackInput) => Promise<AddTrackToPlaylistResult>;
  addSource: () => Promise<LibrarySnapshotJson>;
  confirmAddTrackToPlaylist: (input: PlaylistTrackInput) => Promise<PlaylistTrack>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<PlaylistCreationResult>;
  createPlaylistFromTrack: (trackId: number) => Promise<PlaylistDetails>;
  deletePlaylist: (playlistId: number) => Promise<LibrarySnapshotJson>;
  disableSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  enableSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  forgetSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  loadLibrary: () => Promise<LibrarySnapshotJson>;
  loadPlaybackSession: () => Promise<SavedPlaybackSession | null>;
  loadPlaylist: (playlistId: number) => Promise<PlaylistDetails | null>;
  openDataFolder: () => Promise<void>;
  removePlaylistTrack: (input: PlaylistTrackRemovalInput) => Promise<void>;
  rescanSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  rescanSources: () => Promise<LibrarySnapshotJson>;
  savePlaybackPosition: (position: number) => Promise<void>;
  savePlaybackSession: (session: SavedPlaybackSession) => Promise<void>;
  setTrackLiked: (input: TrackLikeInput) => Promise<TrackLikeResult>;
};

type PlaybackSessionMethod = "loadPlaybackSession" | "savePlaybackPosition" | "savePlaybackSession";

export type LumeApi = Omit<LumeInvokeApi, PlaybackSessionMethod> & {
  playbackSession: {
    flush: (session: SavedPlaybackSession) => void;
    load: LumeInvokeApi["loadPlaybackSession"];
    save: LumeInvokeApi["savePlaybackSession"];
    savePosition: LumeInvokeApi["savePlaybackPosition"];
  };
  onLibraryUpdate: (listener: (update: LibraryUpdate) => void) => () => void;
  isMac: boolean;
};

// Electron includes the channel name in the error text the renderer shows for a failed call.
export const lumeChannels = {
  addTrackToPlaylist: "lume:add-track-to-playlist",
  addSource: "lume:add-source",
  confirmAddTrackToPlaylist: "lume:confirm-add-track-to-playlist",
  createPlaylist: "lume:create-playlist",
  createPlaylistFromTrack: "lume:create-playlist-from-track",
  deletePlaylist: "lume:delete-playlist",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  loadLibrary: "lume:load-library",
  loadPlaybackSession: "lume:load-playback-session",
  loadPlaylist: "lume:load-playlist",
  openDataFolder: "lume:open-data-folder",
  removePlaylistTrack: "lume:remove-playlist-track",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
  savePlaybackPosition: "lume:save-playback-position",
  savePlaybackSession: "lume:save-playback-session",
  setTrackLiked: "lume:set-track-liked",
} as const satisfies Record<keyof LumeInvokeApi, `lume:${string}`>;

export const lumeEventChannels = {
  flushPlaybackSession: "lume:flush-playback-session",
  libraryUpdated: "lume:library-updated",
} as const;

export const appScheme = "lume";

export function getTrackUrl(id: number) {
  return `${appScheme}://app/media/${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${appScheme}://app/artwork/${encodeURIComponent(id)}`;
}
