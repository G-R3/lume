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
  album: string;
  artworkUrl: string | null;
  available: boolean;
  id: number;
  url: string;
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
  entryCount: number;
  id: number;
  title: string;
};

export type PlaylistCreationInput = {
  description: string | null;
  title: string;
};

export type PlaylistEntry = {
  id: number;
  position: number;
  trackId: number;
};

export type PlaylistDetails = {
  description: string | null;
  entries: PlaylistEntry[];
  id: number;
  title: string;
};

export type AddTrackToPlaylistResult =
  | { entry: PlaylistEntry; kind: "added" }
  | { kind: "duplicate" };

export type MusicLibrary = {
  kind: "library";
  playlists: PlaylistSummary[];
  sources: LibrarySource[];
  tracks: Track[];
};

export type LibrarySnapshot = MusicLibrary | { kind: "first-run" };

export type PlaylistCreationResult = {
  library: LibrarySnapshot;
  playlist: PlaylistSummary;
};

export type LumeApi = {
  addTrackToPlaylist: (playlistId: number, trackId: number) => Promise<AddTrackToPlaylistResult>;
  addSource: () => Promise<LibrarySnapshot>;
  confirmAddTrackToPlaylist: (playlistId: number, trackId: number) => Promise<PlaylistEntry>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<PlaylistCreationResult>;
  createPlaylistFromTrack: (trackId: number) => Promise<PlaylistDetails>;
  deletePlaylist: (playlistId: number) => Promise<LibrarySnapshot>;
  disableSource: (sourceId: number) => Promise<LibrarySnapshot>;
  enableSource: (sourceId: number) => Promise<LibrarySnapshot>;
  forgetSource: (sourceId: number) => Promise<LibrarySnapshot>;
  loadLibrary: () => Promise<LibrarySnapshot>;
  loadPlaylist: (playlistId: number) => Promise<PlaylistDetails | null>;
  onLibraryUpdate: (listener: (library: LibrarySnapshot) => void) => () => void;
  openDataFolder: () => Promise<void>;
  rescanSource: (sourceId: number) => Promise<LibrarySnapshot>;
  rescanSources: () => Promise<LibrarySnapshot>;
  removePlaylistEntry: (playlistId: number, entryId: number) => Promise<void>;
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
  libraryUpdated: "lume:library-updated",
  openDataFolder: "lume:open-data-folder",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
  removePlaylistEntry: "lume:remove-playlist-entry",
} as const;

export const appScheme = "lume";

export function getTrackUrl(id: number) {
  return `${appScheme}://app/media/${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${appScheme}://app/artwork/${encodeURIComponent(id)}`;
}
