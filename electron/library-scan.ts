import type { DatabaseSync } from "node:sqlite";
import { scanAudioFiles } from "./library";
import {
  applyScanFailure,
  applySourceScan,
  getEnabledSources,
  getSource,
  getTrackMetadata,
} from "./library-store";

const scanVersions = new WeakMap<DatabaseSync, Map<string, number>>();

export async function scanEnabledSources(database: DatabaseSync) {
  for (const source of getEnabledSources(database)) {
    await scanSource(database, source.id);
  }
}

export async function scanSource(
  database: DatabaseSync,
  sourceId: string,
  scanFiles = scanAudioFiles, // Injectable so overlapping scans can be tested without timing-dependent filesystem work
): Promise<void> {
  const source = getSource(database, sourceId);
  if (!source.enabled) throw new Error(`Library source ${sourceId} is disabled`);

  const versions = getScanVersions(database);
  const version = (versions.get(sourceId) ?? 0) + 1;
  versions.set(sourceId, version);
  let scan: Awaited<ReturnType<typeof scanAudioFiles>>;

  try {
    scan = await scanFiles(source.path, getTrackMetadata(database, sourceId));
  } catch (error) {
    if (versions.get(sourceId) !== version) return;

    console.warn("Could not read library source", { error, sourceId });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);
    applyScanFailure(database, sourceId, message);
    return;
  }

  if (versions.get(sourceId) !== version) return;
  applySourceScan(database, sourceId, scan);
}

function getScanVersions(database: DatabaseSync) {
  const existing = scanVersions.get(database);
  if (existing) return existing;

  const versions = new Map<string, number>();
  scanVersions.set(database, versions);
  return versions;
}

function getScanErrorMessage(error: Error) {
  if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) {
    return "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";
  }

  return error.message;
}
