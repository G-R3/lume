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

export const backupKinds = ["manual", "migration", "emergency"] as const;
export type BackupKind = (typeof backupKinds)[number];

export const backupLimits = {
  manual: 5,
  migration: 3,
  emergency: null, // No retention rule yet.
} as const satisfies Record<BackupKind, number | null>;

export type LibraryBackup = {
  createdAt: number;
  id: string;
  kind: BackupKind;
};

export type LumeApi = {
  addSource: () => Promise<LibraryUpdate>;
  createManualBackup: () => Promise<LibraryBackup[]>;
  disableSource: (sourceId: string) => Promise<LibraryUpdate>;
  enableSource: (sourceId: string) => Promise<LibraryUpdate>;
  forgetSource: (sourceId: string) => Promise<LibraryUpdate>;
  loadBackups: () => Promise<LibraryBackup[]>;
  loadLibrary: () => Promise<LibraryUpdate>;
  onLibraryUpdate: (listener: (update: LibraryUpdate) => void) => () => void;
  openDataFolder: () => Promise<void>;
  replaceOldestManualBackup: () => Promise<LibraryBackup[]>;
  restoreBackup: (backupId: string) => Promise<void>;
  rescanSource: (sourceId: string) => Promise<LibraryUpdate>;
  rescanSources: () => Promise<LibraryUpdate>;
  isMac: boolean;
};

export const lumeChannels = {
  addSource: "lume:add-source",
  createManualBackup: "lume:create-manual-backup",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  loadLibrary: "lume:load-library",
  libraryUpdated: "lume:library-updated",
  loadBackups: "lume:load-backups",
  openDataFolder: "lume:open-data-folder",
  replaceOldestManualBackup: "lume:replace-oldest-manual-backup",
  restoreBackup: "lume:restore-backup",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
} as const;
