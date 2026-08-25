export type Track = {
  id: string;
  name: string;
  url: string;
};

export type LumeApi = {
  chooseMusicFolder: () => Promise<string | null>;
  scanLibrary: () => Promise<Track[]>;
};

export const lumeChannels = {
  chooseMusicFolder: "lume:choose-music-folder",
  scanLibrary: "lume:scan-library",
} as const satisfies Record<keyof LumeApi, string>;
