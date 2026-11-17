import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { openTestDatabase } from "./helpers/database";
import { getActiveSource, libraryTracks, readLibrary, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vite-plus/test";

import {
  disableSource,
  enableSource,
  forgetSource,
  getArtworkData,
  saveSource,
  scanEnabledSources,
  scanSource,
} from "../electron/library";
import { scanAudioFiles, type ScannedTrack } from "../electron/library-files";
import { getLibraryState, onLibraryEvent } from "../electron/library-events";
import type { LibraryEvent } from "@shared/library";

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
    ).resolves.toEqual(committed());
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

  it("drops a source turned off during a batch and keeps the others", async () => {
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

    expect(
      database.$client.prepare("SELECT source_id FROM tracks ORDER BY source_id").all(),
    ).toEqual(
      [firstSource.id, lastSource.id]
        .sort((firstId, secondId) => firstId - secondId)
        .map((sourceId) => ({ source_id: sourceId })),
    );
  });

  it("records a scan it could not save as failed, and a rescan recovers it", async () => {
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

    await scanEnabledSources();

    expect(getActiveSource(source.id).status).toEqual({
      errorMessage: "track write failed",
      kind: "failed",
      lastScannedAt: null,
    });
    expect(readLibrary().scans.scanning).toEqual([]);

    database.$client.exec("DROP TRIGGER reject_track_insert");
    await scanSource(source.id);

    expect(getActiveSource(source.id).status.kind).toBe("scanned");
    expect(libraryTracks().map((track) => track.title)).toEqual(["song"]);
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

describe("scan frames", () => {
  it("pushes a scan's start and its end, which follows the commit it made", async () => {
    await openTestDatabase();
    const source = await createSource(["song"]);
    const events = recordLibraryEvents();

    await scanSource(source.id);

    const frames = events.flatMap((event) => (event.kind === "scans" ? [event.scans] : []));
    const commit = events.find((event) => event.kind === "changed");

    expect(frames.map((frame) => frame.scanning)).toEqual([[source.id], []]);
    expect(frames[1].afterRevision).toBe(commit?.revision);
    expect(frames[1].sequence).toBeGreaterThan(frames[0].sequence);
    expect(getLibraryState().scans).toEqual(frames[1]);
  });

  it("scans every enabled folder at once and reports both until each finishes", async () => {
    await openTestDatabase();
    const first = await createSource([]);
    const second = await createSource([]);
    const reads = new Map<string, Deferred<ScannedTrack[]>>();
    const events = recordLibraryEvents();

    const batch = scanEnabledSources((folder) => {
      const read = createDeferred<ScannedTrack[]>();
      reads.set(folder, read);

      return read.promise;
    });

    expect(getLibraryState().scans.scanning).toEqual([first.id, second.id]);
    reads.get(second.path)?.resolve([]);
    await expect.poll(() => getLibraryState().scans.scanning).toEqual([first.id]);
    reads.get(first.path)?.resolve([]);
    await batch;

    expect(getLibraryState().scans.scanning).toEqual([]);
    expect(events.filter((event) => event.kind === "changed")).toHaveLength(2);
  });

  it("ends a failing scan with the folder's failure and nothing left scanning", async () => {
    await openTestDatabase();
    const source = await createSource(["song"]);
    await rename(source.path, `${source.path}-away`);

    await scanSource(source.id);

    expect(getActiveSource(source.id).status.kind).toBe("missing");
    expect(getLibraryState().scans.scanning).toEqual([]);
  });

  it("reports the running scans with every library read", async () => {
    await openTestDatabase();
    const source = await createSource([]);
    const scan = scanSource(source.id, () => new Promise<never>(() => {}));

    expect(readLibrary().scans.scanning).toEqual([source.id]);
    disableSource(source.id);
    await scan;
    expect(readLibrary().scans.scanning).toEqual([]);
  });

  it("stops reporting a folder as scanning the moment it is turned off", async () => {
    await openTestDatabase();
    const source = await createSource([]);
    const scan = scanSource(source.id, () => new Promise<never>(() => {}));

    expect(getLibraryState().scans.scanning).toEqual([source.id]);
    disableSource(source.id);

    expect(getLibraryState().scans.scanning).toEqual([]);
    await expect(scan).resolves.toEqual(dropped("disabled"));
  });

  it("turns a folder on and scans it without another command", async () => {
    await openTestDatabase();
    const source = await createSource(["song"]);
    disableSource(source.id);

    await enableSource(source.id);

    expect(getActiveSource(source.id).status.kind).toBe("scanned");
    expect(libraryTracks().map((track) => track.title)).toEqual(["song"]);
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
    await expect(newerScan).resolves.toEqual(committed());
    expect(libraryTracks().map((track) => track.title)).toEqual(["new"]);
  });

  it.each([
    {
      leave: "turned off and on again",
      reenter: (sourceId: number) => {
        disableSource(sourceId);
        void enableSource(sourceId, stalledRead);
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
    ).resolves.toEqual(committed());
    expect(libraryTracks().map((track) => track.available)).toEqual([true]);
  });

  it("keeps the new lifetime's scan when a revoked read fails afterwards", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    const revokedRead = createDeferred<ScannedTrack[]>();
    const revokedScan = scanSource(source.id, () => revokedRead.promise);

    disableSource(source.id);
    void enableSource(source.id, stalledRead);
    await expect(
      scanWith(source.id, [createScannedTrack(join(folder, "new.mp3"), "new")]),
    ).resolves.toEqual(committed());
    revokedRead.reject(new Error("read failed"));

    await expect(revokedScan).resolves.toEqual(dropped("disabled"));
    expect(getActiveSource(source.id).status.kind).toBe("scanned");
    expect(libraryTracks().map(({ available, title }) => ({ available, title }))).toEqual([
      { available: true, title: "new" },
    ]);
  });

  it("finishes a batch when a stalled read is stopped", async () => {
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

    await expect(batch).resolves.toEqual([dropped("disabled"), committed()]);
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
    const rescan = enableSource(source.id);
    expect(getActiveSource(source.id).status).toEqual({ kind: "unscanned" });
    await rescan;
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

function stalledRead() {
  return new Promise<never>(() => {});
}

function committed() {
  return { kind: "committed" };
}

function recordLibraryEvents() {
  const events: LibraryEvent[] = [];
  onTestFinished(onLibraryEvent((event) => events.push(event)));

  return events;
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
