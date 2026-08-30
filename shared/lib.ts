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
};

export type MusicLibrary = {
  sources: LibrarySource[];
  tracks: Track[];
};

export type ScanFailure = {
  error: string;
  sourceId: string;
};

export type LibraryUpdate = {
  library: MusicLibrary | null;
  scanFailures: ScanFailure[];
};

export type LumeApi = {
  addSource: () => Promise<LibraryUpdate>;
  disableSource: (sourceId: string) => Promise<LibraryUpdate>;
  enableSource: (sourceId: string) => Promise<LibraryUpdate>;
  forgetSource: (sourceId: string) => Promise<LibraryUpdate>;
  loadLibrary: () => Promise<LibraryUpdate>;
  onLibraryUpdate: (listener: (update: LibraryUpdate) => void) => () => void;
  rescanSource: (sourceId: string) => Promise<LibraryUpdate>;
  rescanSources: () => Promise<LibraryUpdate>;
  isMac: boolean;
};

export const lumeChannels = {
  addSource: "lume:add-source",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  loadLibrary: "lume:load-library",
  libraryUpdated: "lume:library-updated",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
} as const;
