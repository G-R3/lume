export type LumeApi = {
  chooseMusicFolder: () => Promise<string | null>;
};

export const lumeChannels = {
  chooseMusicFolder: "lume:choose-music-folder",
} as const satisfies Record<keyof LumeApi, string>;
