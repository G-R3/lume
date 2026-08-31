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
  let tracks: Awaited<ReturnType<typeof scanAudioFiles>>;

  try {
    tracks = await scanAudioFiles(source.path, getTrackMetadata(database, source.id));
  } catch (error) {
    console.warn("Could not read library source", { error, sourceId: source.id });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);
    applyScanFailure(database, source.id, message);
    return { error: message, sourceId: source.id };
  }

  applySourceScan(database, source.id, tracks);
  return null;
}

function getScanErrorMessage(error: Error) {
  if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) {
    return "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";
  }

  return error.message;
}
