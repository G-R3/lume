import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, getDatabase, initializeDatabase } from "./database";
import {
  applySourceScan,
  disableSource,
  getSource,
  getTracks,
  saveSource,
  scanEnabledSources,
  scanSource,
} from "./library";
import { scanAudioFiles, type ScannedTrack } from "./library-files";

const temporaryFolders: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("enabled source scanning", () => {
  it("discards an older scan that finishes after a newer scan", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const olderScan = createDeferred<ScannedTrack[]>();
    const olderRequest = scanSource(source.id, () => olderScan.promise);

    await scanSource(source.id, () =>
      Promise.resolve([createScannedTrack(join(folder, "new.mp3"), "new")]),
    );
    olderScan.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]);
    await olderRequest;

    expect(
      getTracks().map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([{ available: true, title: "new" }]);
  });

  it("isolates source failures and records their unavailable tracks", async () => {
    await openTestDatabase();
    const healthyFolder = await createTemporaryFolder("lume-healthy-source-");
    const missingFolder = await createTemporaryFolder("lume-missing-source-");
    await Promise.all([
      writeFile(join(healthyFolder, "healthy.mp3"), ""),
      writeFile(join(missingFolder, "missing.mp3"), ""),
    ]);
    const healthySource = await saveSource(healthyFolder);
    const missingSource = await saveSource(missingFolder);
    applySourceScan(missingSource.id, await scanAudioFiles(missingFolder));

    const lastSuccessfulScan = getSource(missingSource.id).lastScannedAt;

    await rm(missingFolder, { recursive: true });

    await scanEnabledSources();
    expect(
      getTracks().map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([
      { available: true, title: "healthy" },
      { available: false, title: "missing" },
    ]);
    expect(getSource(missingSource.id)).toMatchObject({
      lastScanError: expect.stringContaining("ENOENT"),
      lastScannedAt: lastSuccessfulScan,
      trackCount: 0,
    });
    expect(getSource(healthySource.id)).toMatchObject({
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
    const firstSource = await saveSource(firstFolder);
    const disabledSource = await saveSource(disabledFolder);
    const lastSource = await saveSource(lastFolder);

    const setCreatedAt = database.$client.prepare(
      "UPDATE library_sources SET created_at = ? WHERE id = ?",
    );

    setCreatedAt.run(1, firstSource.id);
    setCreatedAt.run(2, disabledSource.id);
    setCreatedAt.run(3, lastSource.id);

    const scannedFolders: string[] = [];

    await scanEnabledSources(async (folder) => {
      scannedFolders.push(folder);

      if (folder === firstSource.path) disableSource(disabledSource.id);

      return [createScannedTrack(join(folder, "song.mp3"), folder)];
    });

    expect(scannedFolders).toEqual([firstSource.path, lastSource.path]);
    expect(
      database.$client.prepare("SELECT source_id FROM tracks ORDER BY source_id").all(),
    ).toEqual(
      [firstSource.id, lastSource.id]
        .sort((firstId, secondId) => firstId - secondId)
        .map((sourceId) => ({ source_id: sourceId })),
    );
  });

  it("does not report database failures as source scan errors", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(folder);
    database.$client.exec(`
      CREATE TRIGGER reject_track_insert
      BEFORE INSERT ON tracks
      BEGIN
        SELECT RAISE(ABORT, 'track write failed');
      END;
    `);

    await expect(scanEnabledSources()).rejects.toThrow("track write failed");
    expect(getSource(source.id).lastScanError).toBeNull();
  });

  it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
    "skips an unreadable file without failing its source",
    async () => {
      await openTestDatabase();
      const folder = await createTemporaryFolder("lume-source-");
      const inaccessiblePath = join(folder, "inaccessible.wav");
      await Promise.all([
        writeFile(join(folder, "readable.mp3"), ""),
        writeFile(inaccessiblePath, ""),
      ]);
      await chmod(inaccessiblePath, 0o000);
      const source = await saveSource(folder);

      await scanSource(source.id);
      expect(getTracks().map((track) => track.title)).toEqual(["readable"]);
      expect(getSource(source.id).lastScanError).toBeNull();
    },
  );
});

async function openTestDatabase() {
  await initializeDatabase({
    location: ":memory:",
    migrationsFolder: join(import.meta.dirname, "../drizzle"),
  });

  return getDatabase();
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
