import type { LibraryDatabase } from "./database";
import {
  applyScanFailure,
  applySourceScan,
  getEnabledSource,
  getEnabledSources,
  getTrackMetadata,
  scanAudioFiles,
} from "./library";

const scanVersions = new WeakMap<LibraryDatabase, Map<string, number>>();

export async function scanEnabledSources(database: LibraryDatabase, scanFiles = scanAudioFiles) {
  for (const source of getEnabledSources()) {
    await scanSource(database, source.id, scanFiles);
  }
}

export async function scanSource(
  database: LibraryDatabase,
  sourceId: string,
  scanFiles = scanAudioFiles, // Injectable so overlapping scans can be tested without timing-dependent filesystem work
): Promise<void> {
  const source = getEnabledSource(sourceId);

  if (!source) return;

  const versions = getScanVersions(database);
  const version = (versions.get(sourceId) ?? 0) + 1;
  versions.set(sourceId, version);
  let scan: Awaited<ReturnType<typeof scanAudioFiles>>;

  try {
    scan = await scanFiles(source.path, getTrackMetadata(sourceId));
  } catch (error) {
    if (versions.get(sourceId) !== version) return;

    console.warn("Could not read library source", { error, sourceId });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);
    applyScanFailure(sourceId, message);

    return;
  }

  if (versions.get(sourceId) !== version) return;
  applySourceScan(sourceId, scan);
}

function getScanVersions(database: LibraryDatabase) {
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
