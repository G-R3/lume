import { chmod, rm, writeFile } from "node:fs/promises";
import { openTestDatabase } from "./helpers/database";
import { failScan, getActiveSource, libraryTracks, readLibrary, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  disableSource,
  enableSource,
  forgetSource,
  getArtworkData,
  getLibraryUpdate,
  getSources,
  saveSource,
  scanEnabledSources,
  scanSource,
  setTracksLiked,
} from "../electron/library";
import { scanAudioFiles, type ScannedTrack } from "../electron/library-files";
import { createPlaylist } from "../electron/playlists";
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
    ).resolves.toEqual(committed(true));
    olderScan.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]);
    await expect(olderRequest).resolves.toEqual(dropped("superseded"));

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

    const lastSuccessfulScan = scannedAt(missingSource.id);

    await rm(missingFolder, { recursive: true });

    await scanEnabledSources();
    expect(
      libraryTracks().map((track) => ({ available: track.available, title: track.title })),
    ).toEqual([
      { available: true, title: "healthy" },
      { available: false, title: "missing" },
    ]);
    expect(getActiveSource(missingSource.id).status).toEqual({
      errorMessage: expect.any(String),
      kind: "missing",
      lastScannedAt: lastSuccessfulScan,
    });
    expect(getActiveSource(healthySource.id).status).toEqual({
      kind: "scanned",
      scannedAt: expect.any(Number),
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
    expect(getActiveSource(source.id).status).toEqual({ kind: "unscanned" });
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
      UPDATE tracks SET missing_since = 1 WHERE title = 'restored';
      UPDATE library_sources
        SET last_scan_outcome = 'failed', last_scan_error_message = 'scan failed', last_scanned_at = 1;
    `);
    await rm(join(folder, "removed.mp3"));

    expect(await scanUnchanged()).toEqual(committed(true));
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);
    expect(scannedAt(source.id)).toBeGreaterThan(1);

    expect(await scanUnchanged()).toEqual(committed(false));
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);

    await failScan(source.id, "scan failed");
    expect(libraryTracks().map((track) => track.unavailableReason)).toEqual([
      "source-unreadable",
      "source-unreadable",
      "source-unreadable",
    ]);

    expect(await scanUnchanged()).toEqual(committed(true));
    expect(getAvailability()).toEqual([
      { available: true, title: "kept" },
      { available: false, title: "removed" },
      { available: true, title: "restored" },
    ]);
    expect(getActiveSource(source.id).status.kind).toBe("scanned");
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
      expect(getActiveSource(source.id).status.kind).toBe("scanned");
    },
  );
});

describe("startup scan update", () => {
  it("sends only the sources after a scan that wrote no track rows", async () => {
    const database = await openTestDatabase();
    const source = await createSource(["first", "second"]);
    await scanEnabledSources();
    const [first, second] = libraryTracks();
    setTracksLiked({ liked: true, trackIds: [second.id] });
    createPlaylist({ description: null, title: "Mix", trackIds: [first.id] });
    database.$client.exec("UPDATE library_sources SET last_scanned_at = 1");
    const before = readLibrary();

    const result = await scanEnabledSources();

    expect(result).toBe("tracks-unchanged");
    expect(getLibraryUpdate(result)).toEqual({
      kind: "sources",
      revision: expect.any(Number),
      sources: getSources(),
    });
    expect(scannedAt(source.id)).toBeGreaterThan(1);

    const after = readLibrary();

    if (before.kind !== "library" || after.kind !== "library")
      throw new Error("Expected a library");
    expect({ ...after, revision: before.revision, sources: before.sources }).toEqual(before);
    expect(after.sources).toEqual([
      {
        ...before.sources[0],
        status: { kind: "scanned", scannedAt: expect.any(Number), trackCount: 2 },
      },
    ]);
  });

  it("sends only the sources when an earlier error clears on an empty source", async () => {
    await openTestDatabase();
    const source = await createSource([]);
    await failScan(source.id, "Folder is missing");

    const result = await scanEnabledSources();

    expect(result).toBe("tracks-unchanged");
    expect(getLibraryUpdate(result)).toEqual({
      kind: "sources",
      revision: expect.any(Number),
      sources: [
        {
          id: source.id,
          path: source.path,
          status: { kind: "scanned", scannedAt: expect.any(Number), trackCount: 0 },
        },
      ],
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
        database.$client.exec("UPDATE tracks SET missing_since = 1 WHERE title = 'first'"),
    },
    {
      change: "an earlier failure closed its folder",
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

    expect(result).toBe("tracks-changed");
    const update = getLibraryUpdate(result);

    if (update?.kind !== "snapshot") throw new Error("Expected a snapshot update");
    expect(parseLibrarySnapshot(update.library)).toStrictEqual({
      ...readLibrary(),
      revision: expect.any(Number),
    });
  });

  it("sends the full snapshot when any one source changed", async () => {
    const database = await openTestDatabase();
    const unchanged = await createSource(["kept"]);
    const changed = await createSource(["first"]);
    await scanEnabledSources();
    database.$client.exec("UPDATE library_sources SET last_scanned_at = 1");
    await writeFile(join(changed.path, "new.mp3"), "");

    await expect(scanEnabledSources()).resolves.toBe("tracks-changed");
    expect(scannedAt(unchanged.id)).toBeGreaterThan(1);
  });

  it("sends only the sources when a source is disabled during the scan", async () => {
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

    expect(result).toBe("tracks-unchanged");
  });

  it("sends only the sources when a newer scan supersedes a failed read", async () => {
    await openTestDatabase();
    const source = await createSource(["first"]);
    await scanEnabledSources();
    const startupRead = createDeferred<ScannedTrack[]>();

    const startupScan = scanEnabledSources(() => startupRead.promise);
    await expect(scanSource(source.id)).resolves.toEqual(committed(false));
    startupRead.reject(new Error("read failed"));

    await expect(startupScan).resolves.toBe("tracks-unchanged");
    expect(getActiveSource(source.id).status.kind).toBe("scanned");
  });

  it("sends only the sources when a folder that already failed fails again", async () => {
    await openTestDatabase();
    const source = await createSource(["first"]);
    await scanEnabledSources();
    await rm(source.path, { recursive: true });

    await expect(scanEnabledSources()).resolves.toBe("tracks-changed");
    const failed = getActiveSource(source.id);
    expect(failed.status).toMatchObject({ kind: "missing", lastScannedAt: expect.any(Number) });

    const result = await scanEnabledSources();

    expect(result).toBe("tracks-unchanged");
    expect(getLibraryUpdate(result)).toEqual({
      kind: "sources",
      revision: expect.any(Number),
      sources: [failed],
    });
    expect(libraryTracks().map((track) => track.available)).toEqual([false]);
  });

  it.each([
    { sources: "no sources", disable: false },
    { sources: "only disabled sources", disable: true },
  ])("sends nothing when there are $sources", async ({ disable }) => {
    await openTestDatabase();

    if (disable) disableSource((await createSource(["first"])).id);

    const result = await scanEnabledSources();

    expect(result).toBe("no-enabled-sources");
    expect(getLibraryUpdate(result)).toBeNull();
  });
});

describe("scan ownership", () => {
  it("lets only the newer scan commit when the older read finishes first", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const olderRead = createDeferred<ScannedTrack[]>();
    const newerRead = createDeferred<ScannedTrack[]>();
    const olderScan = scanSource(source.id, () => olderRead.promise);
    const newerScan = scanSource(source.id, () => newerRead.promise);

    olderRead.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]);
    await expect(olderScan).resolves.toEqual(dropped("superseded"));
    expect(libraryTracks()).toEqual([]);
    expect(getActiveSource(source.id).status).toEqual({ kind: "unscanned" });

    newerRead.resolve([createScannedTrack(join(folder, "new.mp3"), "new")]);
    await expect(newerScan).resolves.toEqual(committed(true));
    expect(libraryTracks().map((track) => track.title)).toEqual(["new"]);
  });

  it.each([
    {
      leave: "turned off and on again",
      reenter: (sourceId: number) => {
        disableSource(sourceId);
        enableSource(sourceId);
      },
    },
    {
      leave: "forgotten and added again",
      reenter: async (sourceId: number, folder: string) => {
        forgetSource(sourceId);
        expect((await saveSource(folder)).id).toBe(sourceId);
      },
    },
  ])("drops a read from before the folder was $leave", async ({ reenter }) => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    await scanWith(source.id, [createScannedTrack(join(folder, "kept.mp3"), "kept")]);
    const lastScannedAt = scannedAt(source.id);

    for (const settle of [
      (read: Deferred<ScannedTrack[]>) =>
        read.resolve([createScannedTrack(join(folder, "old.mp3"), "old")]),
      (read: Deferred<ScannedTrack[]>) => read.reject(new Error("read failed")),
    ]) {
      const read = createDeferred<ScannedTrack[]>();
      let signal: AbortSignal | undefined;

      const scan = scanSource(source.id, (_folder, _metadata, scanSignal) => {
        signal = scanSignal;

        return read.promise;
      });

      await reenter(source.id, folder);
      expect(signal?.aborted).toBe(true);
      settle(read);

      await expect(scan).resolves.toEqual(dropped("disabled"));
      expect(getActiveSource(source.id).status).toEqual({
        kind: "scanned",
        scannedAt: lastScannedAt,
        trackCount: 1,
      });
      expect(libraryTracks().map(({ available, title }) => ({ available, title }))).toEqual([
        { available: true, title: "kept" },
      ]);
    }

    await expect(
      scanWith(source.id, [{ kind: "unchanged", path: join(folder, "kept.mp3") }]),
    ).resolves.toEqual(committed(false));
    expect(libraryTracks().map((track) => track.available)).toEqual([true]);
  });

  it("keeps the new lifetime's scan when a revoked read fails afterwards", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const revokedRead = createDeferred<ScannedTrack[]>();
    const revokedScan = scanSource(source.id, () => revokedRead.promise);

    disableSource(source.id);
    enableSource(source.id);
    await expect(
      scanWith(source.id, [createScannedTrack(join(folder, "new.mp3"), "new")]),
    ).resolves.toEqual(committed(true));
    revokedRead.reject(new Error("read failed"));

    await expect(revokedScan).resolves.toEqual(dropped("disabled"));
    expect(getActiveSource(source.id).status.kind).toBe("scanned");
    expect(libraryTracks().map(({ available, title }) => ({ available, title }))).toEqual([
      { available: true, title: "new" },
    ]);
  });

  it("moves on to the next folder when a stalled read is stopped", async () => {
    const database = await openTestDatabase();
    const stalled = await createSource([]);
    const next = await createSource([]);
    database.$client
      .prepare("UPDATE library_sources SET created_at = ? WHERE id = ?")
      .run(0, stalled.id);
    const scannedFolders: string[] = [];

    const batch = scanEnabledSources(async (folder) => {
      scannedFolders.push(folder);

      if (folder === stalled.path) {
        queueMicrotask(() => disableSource(stalled.id));

        return new Promise<never>(() => {});
      }

      return [];
    });

    await expect(batch).resolves.toBe("tracks-unchanged");
    expect(scannedFolders).toEqual([stalled.path, next.path]);
    expect(getActiveSource(next.id).status.kind).toBe("scanned");
  });

  it("drops a read that finishes as its folder is turned off", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);

    const scan = scanSource(source.id, async () => {
      queueMicrotask(() => disableSource(source.id));

      return [createScannedTrack(join(folder, "late.mp3"), "late")];
    });

    await expect(scan).resolves.toEqual(dropped("disabled"));
    expect(libraryTracks()).toEqual([]);
    enableSource(source.id);
    expect(getActiveSource(source.id).status).toEqual({ kind: "unscanned" });
  });

  it("drops a scan whose folder is turned off before its read returns a promise", async () => {
    await openTestDatabase();
    const source = await createSource([]);

    const scan = scanSource(source.id, () => {
      disableSource(source.id);

      return new Promise<never>(() => {});
    });

    await expect(scan).resolves.toEqual(dropped("disabled"));
  });

  it("rejects a folder read whose scan already stopped", async () => {
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");

    await expect(scanAudioFiles(folder, new Map(), AbortSignal.abort("disabled"))).rejects.toBe(
      "disabled",
    );
  });
});

function scannedAt(sourceId: number) {
  const { status } = getActiveSource(sourceId);

  if (status.kind !== "scanned") throw new Error(`Expected source ${sourceId} to be scanned`);

  return status.scannedAt;
}

function committed(tracksChanged: boolean) {
  return { kind: "committed", tracksChanged };
}

function dropped(reason: string) {
  return { kind: "dropped", reason };
}

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

type Deferred<T> = ReturnType<typeof createDeferred<T>>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
