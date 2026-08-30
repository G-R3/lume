export type Track = {
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
};

export type MusicLibrary = {
  sources: LibrarySource[];
  tracks: Track[];
};

export type LumeApi = {
  chooseMusicFolder: () => Promise<MusicLibrary | null>;
  forgetLibrarySource: (sourceId: string) => Promise<MusicLibrary | null>;
  loadMusicLibrary: () => Promise<MusicLibrary | null>;
  rescanLibrarySource: (sourceId: string) => Promise<MusicLibrary | null>;
  rescanMusicLibrary: () => Promise<MusicLibrary | null>;
  setLibrarySourceEnabled: (sourceId: string, enabled: boolean) => Promise<MusicLibrary | null>;
  isMac: boolean;
};

export const lumeChannels = {
  chooseMusicFolder: "lume:choose-music-folder",
  forgetLibrarySource: "lume:forget-library-source",
  loadMusicLibrary: "lume:load-music-library",
  rescanLibrarySource: "lume:rescan-library-source",
  rescanMusicLibrary: "lume:rescan-music-library",
  setLibrarySourceEnabled: "lume:set-library-source-enabled",
} as const;
