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

export type MusicLibrary = {
  kind: "library";
  playlists: PlaylistSummary[];
  sources: LibrarySource[];
  tracks: Track[];
};

export type LibrarySnapshot = MusicLibrary | { kind: "first-run" };

export type LumeApi = {
  addSource: () => Promise<LibrarySnapshot>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<LibrarySnapshot>;
  deletePlaylist: (playlistId: string) => Promise<LibrarySnapshot>;
  disableSource: (sourceId: string) => Promise<LibrarySnapshot>;
  enableSource: (sourceId: string) => Promise<LibrarySnapshot>;
  forgetSource: (sourceId: string) => Promise<LibrarySnapshot>;
  loadLibrary: () => Promise<LibrarySnapshot>;
  onLibraryUpdate: (listener: (library: LibrarySnapshot) => void) => () => void;
  openDataFolder: () => Promise<void>;
  rescanSource: (sourceId: string) => Promise<LibrarySnapshot>;
  rescanSources: () => Promise<LibrarySnapshot>;
  isMac: boolean;
};

export const lumeChannels = {
  addSource: "lume:add-source",
  createPlaylist: "lume:create-playlist",
  deletePlaylist: "lume:delete-playlist",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  loadLibrary: "lume:load-library",
  libraryUpdated: "lume:library-updated",
  openDataFolder: "lume:open-data-folder",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
} as const;
