import { chmod, rm, writeFile } from "node:fs/promises";
import { openTestDatabase } from "./helpers/database";
import { failScan, getActiveSource, libraryTracks, readLibrary, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  disableSource,
  getArtworkData,
  getLibrarySnapshot,
  getScanUpdate,
  getSources,
  saveSource,
  scanEnabledSources,
  scanSource,
  setTrackLiked,
} from "../electron/library";
import { scanAudioFiles, type ScannedTrack } from "../electron/library-files";
import { addTrackToPlaylist, createPlaylist } from "../electron/playlists";
import type { LibraryDatabase } from "../electron/database";
import { parseLibrarySnapshot } from "../shared/lib";

describe("enabled source scanning", () => {
  it("discards an older scan that finishes after a newer scan", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const olderScan = createDeferred<ScannedTrack[]>();
    const olderRequest = scanSource(source.id, () => olderScan.promise);

    await expect(
      scanSource(source.id, () =>
        Promise.resolve([createScannedTrack(join(folder, "new.mp3"), "new")]),
      ),
    ).resolves.toBe("changed");
    olderScan.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]);
    await expect(olderRequest).resolves.toBe("superseded");

    expect(
      libraryTracks().map((track) => ({ available: track.available, title: track.title })),
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
    await scanWith(missingSource.id, await scanAudioFiles(missingFolder));

    const lastSuccessfulScan = getActiveSource(missingSource.id).lastScannedAt;

    await rm(missingFolder, { recursive: true });

    await scanEnabledSources();
    expect(
      libraryTracks().map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([
      { available: true, title: "healthy" },
      { available: false, title: "missing" },
    ]);
    expect(getActiveSource(missingSource.id)).toMatchObject({
      lastScanError: expect.stringContaining("ENOENT"),
      lastScannedAt: lastSuccessfulScan,
      trackCount: 0,
    });
    expect(getActiveSource(healthySource.id)).toMatchObject({
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
    expect(getActiveSource(source.id).lastScanError).toBeNull();
  });

  it("reports a change only when a track's availability changed", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await Promise.all(
      ["kept", "removed", "restored"].map((title) => writeFile(join(folder, `${title}.mp3`), "")),
    );
    const source = await saveSource(folder);

    const scanUnchanged = () =>
      scanSource(source.id, (_path, metadata) => scanAudioFiles(folder, metadata));

    const getAvailability = () =>
      libraryTracks().map(({ available, title }) => ({ available, title }));

    await scanWith(source.id, await scanAudioFiles(folder));
    database.$client.exec(`
      UPDATE tracks SET available = title <> 'restored';
      UPDATE library_sources SET last_scan_error = 'scan failed', last_scanned_at = 1;
    `);
    await rm(join(folder, "removed.mp3"));

    expect(await scanUnchanged()).toBe("changed");
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);
    expect(getActiveSource(source.id).lastScanError).toBeNull();
    expect(getActiveSource(source.id).lastScannedAt).toBeGreaterThan(1);

    expect(await scanUnchanged()).toBe("unchanged");
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);

    await failScan(source.id, "scan failed");
    expect(libraryTracks().map((track) => track.available)).toEqual([false, false, false]);

    expect(await scanUnchanged()).toBe("changed");
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);
    expect(getActiveSource(source.id).lastScanError).toBeNull();
  });

  it("removes artwork that changed tracks no longer use", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const path = join(folder, "song.mp3");
    const original = { data: Uint8Array.from([1]), id: "original", mediaType: "image/png" };
    const replacement = { data: Uint8Array.from([2]), id: "replacement", mediaType: "image/png" };

    await scanWith(source.id, [{ ...createScannedTrack(path, "song"), artwork: original }]);
    await scanWith(source.id, [{ kind: "unchanged", path }]);
    expect(getArtworkData(original.id)).not.toBeNull();

    await scanWith(source.id, [{ ...createScannedTrack(path, "song"), artwork: replacement }]);
    expect(getArtworkData(original.id)).toBeNull();
    expect(getArtworkData(replacement.id)).not.toBeNull();
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
      expect(libraryTracks().map((track) => track.title)).toEqual(["readable"]);
      expect(getActiveSource(source.id).lastScanError).toBeNull();
    },
  );
});

describe("startup scan update", () => {
  it("sends only the sources after a scan that wrote no track rows", async () => {
    const database = await openTestDatabase();
    const source = await createSource(["first", "second"]);
    await scanEnabledSources();
    const [first, second] = libraryTracks();
    setTrackLiked({ liked: true, trackId: second.id });
    const playlist = createPlaylist({ description: null, title: "Mix" });
    addTrackToPlaylist({ playlistId: playlist.id, trackId: first.id });
    database.$client.exec("UPDATE library_sources SET last_scanned_at = 1");
    const before = readLibrary();

    const result = await scanEnabledSources();

    expect(result).toBe("unchanged");
    expect(getScanUpdate(result)).toEqual({ kind: "sources", sources: getSources() });
    expect(getActiveSource(source.id).lastScannedAt).toBeGreaterThan(1);

    const after = readLibrary();

    if (before.kind !== "library" || after.kind !== "library")
      throw new Error("Expected a library");
    expect({ ...after, sources: before.sources }).toEqual(before);
    expect(after.sources).toEqual([{ ...before.sources[0], lastScannedAt: expect.any(Number) }]);
  });

  it("sends only the sources when an earlier error clears on an empty source", async () => {
    await openTestDatabase();
    const source = await createSource([]);
    await failScan(source.id, "Folder is missing");

    const result = await scanEnabledSources();

    expect(result).toBe("unchanged");
    expect(getScanUpdate(result)).toEqual({
      kind: "sources",
      sources: [expect.objectContaining({ id: source.id, lastScanError: null, trackCount: 0 })],
    });
  });

  it.each([
    {
      change: "a file's size and time changed",
      apply: (folder: string) => writeFile(join(folder, "first.mp3"), "x"),
    },
    {
      change: "a file was added",
      apply: (folder: string) => writeFile(join(folder, "new.mp3"), ""),
    },
    { change: "a file went missing", apply: (folder: string) => rm(join(folder, "first.mp3")) },
    {
      change: "a missing file reappeared",
      apply: async (_folder: string, database: LibraryDatabase) =>
        database.$client.exec("UPDATE tracks SET available = 0 WHERE title = 'first'"),
    },
    {
      change: "an earlier failure marked its tracks unavailable",
      apply: (_folder: string, _database: LibraryDatabase, sourceId: number) =>
        failScan(sourceId, "Folder is missing"),
    },
    {
      change: "the metadata version changed",
      apply: async (_folder: string, database: LibraryDatabase) =>
        database.$client.exec("UPDATE tracks SET metadata_version = metadata_version - 1"),
    },
    {
      change: "the folder could not be read",
      apply: (folder: string) => rm(folder, { recursive: true }),
    },
  ])("sends the full snapshot when $change", async ({ apply }) => {
    const database = await openTestDatabase();
    const source = await createSource(["first", "second"]);
    await scanEnabledSources();

    await apply(source.path, database, source.id);
    const result = await scanEnabledSources();

    expect(result).toBe("changed");
    const update = getScanUpdate(result);

    if (update?.kind !== "snapshot") throw new Error("Expected a snapshot update");
    expect(parseLibrarySnapshot(update.library)).toStrictEqual(getLibrarySnapshot());
  });

  it("sends the full snapshot when any one source changed", async () => {
    const database = await openTestDatabase();
    const unchanged = await createSource(["kept"]);
    const changed = await createSource(["first"]);
    await scanEnabledSources();
    database.$client.exec("UPDATE library_sources SET last_scanned_at = 1");
    await writeFile(join(changed.path, "new.mp3"), "");

    await expect(scanEnabledSources()).resolves.toBe("changed");
    expect(getActiveSource(unchanged.id).lastScannedAt).toBeGreaterThan(1);
  });

  it("sends the full snapshot when a source is disabled during the scan", async () => {
    await openTestDatabase();
    const first = await createSource(["first"]);
    const second = await createSource(["second"]);
    await scanEnabledSources();
    let disabled = false;

    const result = await scanEnabledSources((folder, metadata) => {
      if (!disabled) disableSource(folder === first.path ? second.id : first.id);
      disabled = true;

      return scanAudioFiles(folder, metadata);
    });

    expect(result).toBe("changed");
  });

  it("sends the full snapshot when a newer scan supersedes a failed read", async () => {
    await openTestDatabase();
    const source = await createSource(["first"]);
    await scanEnabledSources();
    const startupRead = createDeferred<ScannedTrack[]>();

    const startupScan = scanEnabledSources(() => startupRead.promise);
    await expect(scanSource(source.id)).resolves.toBe("unchanged");
    startupRead.reject(new Error("read failed"));

    await expect(startupScan).resolves.toBe("changed");
    expect(getActiveSource(source.id).lastScanError).toBeNull();
  });

  it.each([
    { sources: "no sources", disable: false },
    { sources: "only disabled sources", disable: true },
  ])("sends nothing when there are $sources", async ({ disable }) => {
    await openTestDatabase();

    if (disable) disableSource((await createSource(["first"])).id);

    const result = await scanEnabledSources();

    expect(result).toBe("none");
    expect(getScanUpdate(result)).toBeNull();
  });
});

async function createSource(titles: string[]) {
  const folder = await createTemporaryFolder("lume-source-");
  await Promise.all(titles.map((title) => writeFile(join(folder, `${title}.mp3`), "")));

  return saveSource(folder);
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
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
