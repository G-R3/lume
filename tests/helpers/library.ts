import { getLibrarySnapshotJson, getSources, scanSource } from "../../electron/library";
import type { ScannedTrack } from "../../electron/library-files";
import { parseLibrarySnapshot } from "../../shared/lib";

export function getActiveSource(sourceId: number) {
  const source = getSources().find((candidate) => candidate.id === sourceId);

  if (!source) throw new Error(`Library source ${sourceId} is not active`);

  return source;
}

export function readLibrary() {
  return parseLibrarySnapshot(getLibrarySnapshotJson());
}

export function libraryTracks() {
  const library = readLibrary();

  if (library.kind === "first-run") throw new Error("Expected a library snapshot");

  return library.tracks;
}

export function scanWith(sourceId: number, scannedTracks: ScannedTrack[]) {
  return scanSource(sourceId, async () => scannedTracks);
}

export function failScan(sourceId: number, message: string) {
  return scanSource(sourceId, async () => {
    throw new Error(message);
  });
}
