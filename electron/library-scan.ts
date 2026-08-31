import type { DatabaseSync } from "node:sqlite";
import type { LibrarySource, ScanFailure } from "../shared/lib";
import { scanAudioFiles } from "./library";
import {
  applyScanFailure,
  applySourceScan,
  getEnabledSources,
  getTrackMetadata,
} from "./library-store";

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
): Promise<ScanFailure | null> {
  let scan: Awaited<ReturnType<typeof scanAudioFiles>>;

  try {
    scan = await scanAudioFiles(source.path, getTrackMetadata(database, source.id));
  } catch (error) {
    console.warn("Could not read library source", { error, sourceId: source.id });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);
    if (!applyScanFailure(database, source.id, message)) return null;
    return { error: message, sourceId: source.id };
  }

  const error = getSkippedFilesMessage(scan.skippedFileCount);
  if (!applySourceScan(database, source.id, scan, error)) return null;
  return error ? { error, sourceId: source.id } : null;
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
