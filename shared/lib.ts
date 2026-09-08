export type Track = {
  available: boolean;
  duration: number | null;
  format: string;
  id: string;
  name: string;
  url: string;
};

export type LibrarySource = {
  enabled: boolean;
  id: string;
  lastScanError: string | null;
  lastScannedAt: number | null;
  path: string;
  trackCount: number;
};

export type PlaylistSummary = {
  description: string | null;
  entryCount: number;
  id: string;
  title: string;
};

export type PlaylistCreationInput = {
  description: string | null;
  title: string;
};

export type PlaylistEntry = {
  id: string;
  position: number;
  trackId: string;
};

export type PlaylistDetails = {
  description: string | null;
  entries: PlaylistEntry[];
  id: string;
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
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<AddTrackToPlaylistResult>;
  addSource: () => Promise<LibrarySnapshot>;
  confirmAddTrackToPlaylist: (playlistId: string, trackId: string) => Promise<PlaylistEntry>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<PlaylistCreationResult>;
  createPlaylistFromTrack: (trackId: string) => Promise<PlaylistDetails>;
  deletePlaylist: (playlistId: string) => Promise<LibrarySnapshot>;
  disableSource: (sourceId: string) => Promise<LibrarySnapshot>;
  enableSource: (sourceId: string) => Promise<LibrarySnapshot>;
  forgetSource: (sourceId: string) => Promise<LibrarySnapshot>;
  loadLibrary: () => Promise<LibrarySnapshot>;
  loadPlaylist: (playlistId: string) => Promise<PlaylistDetails | null>;
  onLibraryUpdate: (listener: (library: LibrarySnapshot) => void) => () => void;
  openDataFolder: () => Promise<void>;
  rescanSource: (sourceId: string) => Promise<LibrarySnapshot>;
  rescanSources: () => Promise<LibrarySnapshot>;
  removePlaylistEntry: (playlistId: string, entryId: string) => Promise<void>;
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
