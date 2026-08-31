import type { DatabaseSync } from "node:sqlite";
import type { LibrarySource, ScanFailure } from "../shared/lib";
import { scanAudioFiles } from "./library";
import {
  applyScanFailure,
  applySourceScan,
  getEnabledSources,
  getTrackMetadata,
} from "./library-store";

type ScanState = {
  blocked: boolean;
  epoch: number;
  sourceVersions: Map<string, number>;
};

const scanStates = new WeakMap<DatabaseSync, ScanState>();

export async function scanEnabledSources(database: DatabaseSync): Promise<ScanFailure[]> {
  const failures: ScanFailure[] = [];

  for (const source of getEnabledSources(database)) {
    const failure = await scanSource(database, source);
    if (failure) failures.push(failure);
  }

  return failures;
}

export async function scanSource(
  database: DatabaseSync,
  source: Pick<LibrarySource, "id" | "path">,
  scanFiles = scanAudioFiles,
): Promise<ScanFailure | null> {
  const state = getScanState(database);
  if (state.blocked) return null;

  const epoch = state.epoch;
  const sourceVersion = (state.sourceVersions.get(source.id) ?? 0) + 1;
  state.sourceVersions.set(source.id, sourceVersion);
  let scan: Awaited<ReturnType<typeof scanAudioFiles>>;

  try {
    scan = await scanFiles(source.path, getTrackMetadata(database, source.id));
  } catch (error) {
    if (!scanIsCurrent(state, source.id, epoch, sourceVersion)) return null;

    console.warn("Could not read library source", { error, sourceId: source.id });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);
    if (!applyScanFailure(database, source.id, message)) return null;
    return { error: message, sourceId: source.id };
  }

  if (!scanIsCurrent(state, source.id, epoch, sourceVersion)) return null;

  const error = getSkippedFilesMessage(scan.skippedFileCount);
  if (!applySourceScan(database, source.id, scan, error)) return null;
  return error ? { error, sourceId: source.id } : null;
}

export function blockLibraryScans(database: DatabaseSync) {
  const state = getScanState(database);
  state.blocked = true;
  state.epoch += 1;

  return () => {
    state.blocked = false;
  };
}

export function libraryScansAreBlocked(database: DatabaseSync) {
  return getScanState(database).blocked;
}

function getScanState(database: DatabaseSync) {
  const existing = scanStates.get(database);
  if (existing) return existing;

  const state = { blocked: false, epoch: 0, sourceVersions: new Map<string, number>() };
  scanStates.set(database, state);
  return state;
}

function scanIsCurrent(state: ScanState, sourceId: string, epoch: number, sourceVersion: number) {
  return (
    !state.blocked && state.epoch === epoch && state.sourceVersions.get(sourceId) === sourceVersion
  );
}

function getScanErrorMessage(error: Error) {
  if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) {
    return "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";
  }

  return error.message;
}

function getSkippedFilesMessage(count: number) {
  if (count === 0) return null;
  return `${count.toLocaleString()} audio ${count === 1 ? "file was" : "files were"} skipped`;
}
