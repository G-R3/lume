import type { DatabaseSync } from "node:sqlite";
import { scanAudioFiles, type ScannedTrack } from "./library";
import {
  getEnabledLibrarySources,
  reconcileScannedTracks,
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
    let tracks: ScannedTrack[];

    try {
      tracks = await scanAudioFiles(source.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordLibrarySourceScanFailure(database, source.id, message);
      failures.push({ error: message, sourceId: source.id });
      continue;
    }

    reconcileScannedTracks(database, source.id, tracks);
  }

  return failures;
}
