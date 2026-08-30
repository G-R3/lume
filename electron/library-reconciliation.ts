import type { DatabaseSync } from "node:sqlite";
import type { LibrarySource } from "../shared/lib";
import { scanAudioFiles, type ScannedTrack } from "./library";
import {
  applySourceScan,
  getEnabledLibrarySources,
  recordLibrarySourceScanFailure,
} from "./library-store";

export type LibraryScanFailure = {
  error: string;
  sourceId: string;
};

export async function reconcileEnabledLibrarySources(
  database: DatabaseSync,
): Promise<LibraryScanFailure[]> {
  const failures: LibraryScanFailure[] = [];

  for (const source of getEnabledLibrarySources(database)) {
    const failure = await reconcileLibrarySource(database, source);
    if (failure) failures.push(failure);
  }

  return failures;
}

export async function reconcileLibrarySource(
  database: DatabaseSync,
  source: LibrarySource,
): Promise<LibraryScanFailure | null> {
  let tracks: ScannedTrack[];

  try {
    tracks = await scanAudioFiles(source.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordLibrarySourceScanFailure(database, source.id, message);
    return { error: message, sourceId: source.id };
  }

  applySourceScan(database, source.id, tracks);
  return null;
}
