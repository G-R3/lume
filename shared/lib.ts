export type LumeApi = {
  ping: () => Promise<string>;
  selectFolder: () => Promise<string>;
};

export const lumeChannels: Record<keyof LumeApi, string> = {
  ping: "lume:ping",
  selectFolder: "lume:selectFolder",
};
