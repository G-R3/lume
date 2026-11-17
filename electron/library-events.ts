import type { LibraryEvent, LibraryRevision, LibraryState, ScanFrame } from "../shared/library";
import { runImmediateTransaction, type LibraryDatabase } from "./database";

type LibraryChange = Exclude<LibraryEvent, { kind: "scans" }>;

const listeners = new Set<(event: LibraryEvent) => void>();

let revision: LibraryRevision = 0;

let scans: ScanFrame = { afterRevision: revision, scanning: [], sequence: 0 };

export function onLibraryEvent(listener: (event: LibraryEvent) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getLibraryState(): LibraryState {
  return { revision, scans };
}

export function currentLibraryRevision() {
  return revision;
}

export function commitLibrary<Result>(
  database: LibraryDatabase,
  write: Parameters<typeof runImmediateTransaction<Result>>[1],
  describe?: (result: Result, revision: LibraryRevision) => LibraryChange,
): Result {
  const result: Result = runImmediateTransaction(database, write);
  revision += 1;
  publish(describe ? describe(result, revision) : { kind: "changed", revision });

  return result;
}

export function publishScans(scanning: readonly number[]) {
  scans = { afterRevision: revision, scanning, sequence: scans.sequence + 1 };
  publish({ kind: "scans", scans });
}

function publish(event: LibraryEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Could not deliver a library event", error);
    }
  }
}
