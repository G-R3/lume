import type { DatabaseSync } from "node:sqlite";
import type { LibrarySource } from "../shared/lib";
import { scanAudioFiles, type ScannedTrack } from "./library";
import { applyScanFailure, applySourceScan, getEnabledSources } from "./library-store";

export type SourceScanFailure = {
  error: string;
  sourceId: string;
};

export async function scanEnabledSources(database: DatabaseSync): Promise<SourceScanFailure[]> {
  const failures: SourceScanFailure[] = [];

  for (const source of getEnabledSources(database)) {
    const failure = await scanSource(database, source);
    if (failure) failures.push(failure);
  }

  return failures;
}

export async function scanSource(
  database: DatabaseSync,
  source: Pick<LibrarySource, "id" | "path">,
): Promise<SourceScanFailure | null> {
  let tracks: ScannedTrack[];

  try {
    tracks = await scanAudioFiles(source.path);
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
