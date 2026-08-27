export type Track = {
  duration: number | null;
  format: string;
  id: string;
  name: string;
  url: string;
};

export type MusicLibrary = {
  folder: string;
  tracks: Track[];
};

export type LumeApi = {
  chooseMusicFolder: () => Promise<MusicLibrary | null>;
  loadMusicLibrary: () => Promise<MusicLibrary | null>;
};

export const lumeChannels = {
  chooseMusicFolder: "lume:choose-music-folder",
  loadMusicLibrary: "lume:load-music-library",
} as const;
