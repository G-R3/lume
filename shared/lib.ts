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

export type Track = Omit<TrackMetadata, "album"> & {
  addedAt: number;
  album: string;
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

export type LibrarySnapshotJson = string;

export const compactTrackKeys = [
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

export type CompactTrackKey = (typeof compactTrackKeys)[number];

type CompactTrackValue<Key extends CompactTrackKey> = Key extends "albumArtists"
  ? Track[Key] | null
  : Track[Key];

type CompactValues<Keys extends readonly CompactTrackKey[]> = {
  -readonly [Index in keyof Keys]: CompactTrackValue<Keys[Index]>;
};

export type CompactTrack = CompactValues<typeof compactTrackKeys>;

type CompactLibrarySnapshot =
  | { kind: "first-run" }
  | {
      kind: "library";
      playlists: PlaylistSummary[];
      sources: LibrarySource[];
      tracks: CompactTrack[];
    };

export function stringifyFirstRunLibrary(): LibrarySnapshotJson {
  return JSON.stringify({ kind: "first-run" } satisfies LibrarySnapshot);
}

export function stringifyCompactLibrary(
  playlists: PlaylistSummary[],
  sources: LibrarySource[],
  tracks: CompactTrack[],
): LibrarySnapshotJson {
  const library = {
    kind: "library",
    playlists,
    sources,
    tracks,
  } satisfies CompactLibrarySnapshot;

  return JSON.stringify(library);
}

export function compactAlbumArtists(albumArtists: string[], artists: string[]) {
  if (albumArtists.length !== artists.length) return albumArtists;

  for (let index = 0; index < artists.length; index += 1) {
    if (albumArtists[index] !== artists[index]) return albumArtists;
  }

  return null;
}

export function parseLibrarySnapshot(json: LibrarySnapshotJson): LibrarySnapshot {
  // SAFETY: JSON.parse returns an untyped value.
  // Only the two stringify functions above write this text.
  // Main and renderer ship in one bundle, so both sides agree on the track tuple layout.
  const library = JSON.parse(json) as CompactLibrarySnapshot;

  if (library.kind === "first-run") return library;

  // Clear each tuple after expanding it. this lowers peak memory on large libraries
  const compactTracks = library.tracks;
  const releasedTracks: (CompactTrack | null)[] = compactTracks;
  const tracks: Track[] = [];

  for (let index = 0; index < compactTracks.length; index += 1) {
    tracks.push(expandCompactTrack(compactTracks[index]));
    releasedTracks[index] = null;
  }

  return { kind: "library", playlists: library.playlists, sources: library.sources, tracks };
}

function expandCompactTrack(track: CompactTrack) {
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

export type LumeApi = {
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
  loadPlaylist: (playlistId: number) => Promise<PlaylistDetails | null>;
  playbackSession: {
    flush: (session: SavedPlaybackSession) => void;
    load: () => Promise<SavedPlaybackSession | null>;
    save: (session: SavedPlaybackSession) => Promise<void>;
    savePosition: (position: number) => Promise<void>;
  };
  onLibraryUpdate: (listener: (update: LibraryUpdate) => void) => () => void;
  openDataFolder: () => Promise<void>;
  rescanSource: (sourceId: number) => Promise<LibrarySnapshotJson>;
  rescanSources: () => Promise<LibrarySnapshotJson>;
  removePlaylistTrack: (input: PlaylistTrackRemovalInput) => Promise<void>;
  setTrackLiked: (input: TrackLikeInput) => Promise<TrackLikeResult>;
  isMac: boolean;
};

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
  loadPlaylist: "lume:load-playlist",
  loadPlaybackSession: "lume:load-playback-session",
  flushPlaybackSession: "lume:flush-playback-session",
  savePlaybackSession: "lume:save-playback-session",
  savePlaybackPosition: "lume:save-playback-position",
  libraryUpdated: "lume:library-updated",
  openDataFolder: "lume:open-data-folder",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
  removePlaylistTrack: "lume:remove-playlist-track",
  setTrackLiked: "lume:set-track-liked",
} as const;

export const appScheme = "lume";

export function getTrackUrl(id: number) {
  return `${appScheme}://app/media/${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${appScheme}://app/artwork/${encodeURIComponent(id)}`;
}
