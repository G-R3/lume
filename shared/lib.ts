export type Track = {
  duration: number | null;
  format: string;
  id: string;
  name: string;
  url: string;
};

export type LibrarySource = {
  id: string;
  path: string;
};

export type MusicLibrary = {
  sources: LibrarySource[];
  tracks: Track[];
};

export type LumeApi = {
  chooseMusicFolder: () => Promise<MusicLibrary | null>;
  loadMusicLibrary: () => Promise<MusicLibrary | null>;
  rescanMusicLibrary: () => Promise<MusicLibrary | null>;
  isMac: boolean;
};

export const lumeChannels = {
  chooseMusicFolder: "lume:choose-music-folder",
  loadMusicLibrary: "lume:load-music-library",
  rescanMusicLibrary: "lume:rescan-music-library",
} as const;
