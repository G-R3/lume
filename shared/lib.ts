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
  addSource: () => Promise<MusicLibrary | null>;
  disableSource: (sourceId: string) => Promise<MusicLibrary | null>;
  enableSource: (sourceId: string) => Promise<MusicLibrary | null>;
  forgetSource: (sourceId: string) => Promise<MusicLibrary | null>;
  loadLibrary: () => Promise<MusicLibrary | null>;
  rescanSource: (sourceId: string) => Promise<MusicLibrary | null>;
  rescanSources: () => Promise<MusicLibrary | null>;
  isMac: boolean;
};

export const lumeChannels = {
  addSource: "lume:add-source",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  loadLibrary: "lume:load-library",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
} as const;
