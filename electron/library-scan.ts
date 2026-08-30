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
    const message = error instanceof Error ? error.message : String(error);
    applyScanFailure(database, source.id, message);
    return { error: message, sourceId: source.id };
  }

  applySourceScan(database, source.id, tracks);
  return null;
}
