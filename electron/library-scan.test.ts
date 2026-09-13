import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles, type ScannedTrack } from "./library";
import { scanEnabledSources, scanSource } from "./library-scan";
import { disableSource, getSource, saveSource } from "./library-store";
import { applySourceScan, getTracks } from "./track-store";

const temporaryFolders: string[] = [];

const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("enabled source scanning", () => {
  it("discards an older scan that finishes after a newer scan", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(database, folder);
    const olderScan = createDeferred<ScannedTrack[]>();
    const olderRequest = scanSource(database, source.id, () => olderScan.promise);

    await scanSource(database, source.id, () =>
      Promise.resolve([createScannedTrack(join(folder, "new.mp3"), "new")]),
    );
    olderScan.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]);
    await olderRequest;

    expect(
      getTracks(database).map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([{ available: true, title: "new" }]);
  });

  it("isolates source failures and records their unavailable tracks", async () => {
    const database = await openTestDatabase();
    const healthyFolder = await createTemporaryFolder("lume-healthy-source-");
    const missingFolder = await createTemporaryFolder("lume-missing-source-");
    await Promise.all([
      writeFile(join(healthyFolder, "healthy.mp3"), ""),
      writeFile(join(missingFolder, "missing.mp3"), ""),
    ]);
    const healthySource = await saveSource(database, healthyFolder);
    const missingSource = await saveSource(database, missingFolder);
    applySourceScan(database, missingSource.id, await scanAudioFiles(missingFolder));

    const lastSuccessfulScan = getSource(database, missingSource.id).lastScannedAt;

    await rm(missingFolder, { recursive: true });

    await scanEnabledSources(database);
    expect(
      getTracks(database).map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([
      { available: true, title: "healthy" },
      { available: false, title: "missing" },
    ]);
    expect(getSource(database, missingSource.id)).toMatchObject({
      lastScanError: expect.stringContaining("ENOENT"),
      lastScannedAt: lastSuccessfulScan,
      trackCount: 0,
    });
    expect(getSource(database, healthySource.id)).toMatchObject({
      lastScanError: null,
      lastScannedAt: expect.any(Number),
      trackCount: 1,
    });
  });

  it("continues after a later source is disabled during a batch", async () => {
    const database = await openTestDatabase();
    const firstFolder = await createTemporaryFolder("lume-first-source-");
    const disabledFolder = await createTemporaryFolder("lume-disabled-source-");
    const lastFolder = await createTemporaryFolder("lume-last-source-");
    const firstSource = await saveSource(database, firstFolder);
    const disabledSource = await saveSource(database, disabledFolder);
    const lastSource = await saveSource(database, lastFolder);
    const setCreatedAt = database.prepare("UPDATE library_sources SET created_at = ? WHERE id = ?");
    setCreatedAt.run(1, firstSource.id);
    setCreatedAt.run(2, disabledSource.id);
    setCreatedAt.run(3, lastSource.id);
    const scannedFolders: string[] = [];

    await scanEnabledSources(database, async (folder) => {
      scannedFolders.push(folder);

      if (folder === firstSource.path) disableSource(database, disabledSource.id);

      return [createScannedTrack(join(folder, "song.mp3"), folder)];
    });

    expect(scannedFolders).toEqual([firstSource.path, lastSource.path]);
    expect(database.prepare("SELECT source_id FROM tracks ORDER BY source_id").all()).toEqual(
      [firstSource.id, lastSource.id].sort().map((sourceId) => ({ source_id: sourceId })),
    );
  });

  it("does not report database failures as source scan errors", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(database, folder);
    database.exec(`
      CREATE TRIGGER reject_track_insert
      BEFORE INSERT ON tracks
      BEGIN
        SELECT RAISE(ABORT, 'track write failed');
      END;
    `);

    await expect(scanEnabledSources(database)).rejects.toThrow("track write failed");
    expect(getSource(database, source.id).lastScanError).toBeNull();
  });

  it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
    "skips an unreadable file without failing its source",
    async () => {
      const database = await openTestDatabase();
      const folder = await createTemporaryFolder("lume-source-");
      const inaccessiblePath = join(folder, "inaccessible.wav");
      await Promise.all([
        writeFile(join(folder, "readable.mp3"), ""),
        writeFile(inaccessiblePath, ""),
      ]);
      await chmod(inaccessiblePath, 0o000);
      const source = await saveSource(database, folder);

      await scanSource(database, source.id);
      expect(getTracks(database).map((track) => track.title)).toEqual(["readable"]);
      expect(getSource(database, source.id).lastScanError).toBeNull();
    },
  );
});

async function openTestDatabase() {
  const database = await openLibraryDatabase(":memory:");
  openDatabases.push(database);

  return database;
}

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}

function createScannedTrack(path: string, title: string) {
  return {
    album: null,
    albumArtists: [],
    artists: [],
    artwork: null,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: null,
    fileSize: 1,
    format: "MP3",
    genres: [],
    kind: "changed" as const,
    lossless: null,
    modifiedAt: 1,
    title,
    path,
    sampleRate: null,
    trackNumber: null,
    trackTotal: null,
    year: null,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
