import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, getDatabase, initializeDatabase } from "./database";
import {
  applySourceScan,
  disableSource,
  enableSource,
  forgetSource,
  getArtworkData,
  getSource,
  getSources,
  getTrackPath,
  getTracks,
  hasForgottenSources,
  saveSource,
  scanAudioFiles,
} from "./library";

const temporaryFolders: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library source persistence", () => {
  it("reports whether a library has forgotten sources", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");

    expect(hasForgottenSources()).toBe(false);
    const source = await saveSource(folder);
    expect(hasForgottenSources()).toBe(false);
    forgetSource(source.id);
    expect(hasForgottenSources()).toBe(true);
  });

  it("reuses a source ID after the database is reopened", async () => {
    const folder = await createTemporaryFolder("lume-source-");
    const databaseFolder = await createTemporaryFolder("lume-database-");
    const databasePath = join(databaseFolder, "library.sqlite");
    await openTestDatabase(databasePath);
    const source = await saveSource(folder);
    closeDatabase();

    await openTestDatabase(databasePath);
    await expect(saveSource(folder)).resolves.toEqual(source);
    expect(getSources()).toEqual([
      {
        enabled: true,
        id: source.id,
        lastScanError: null,
        lastScannedAt: null,
        path: source.path,
        trackCount: 0,
      },
    ]);
  });

  it("rejects nested and containing source folders", async () => {
    await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    await saveSource(parent);

    await expect(saveSource(child)).rejects.toThrow("overlaps");

    const otherParent = await createTemporaryFolder("lume-source-");
    const otherChild = join(otherParent, "music");
    await mkdir(otherChild);
    await saveSource(otherChild);

    await expect(saveSource(otherParent)).rejects.toThrow("overlaps");
  });

  it("keeps tracks unavailable until a re-enabled source is scanned", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    expect(getSource(source.id).trackCount).toBe(1);

    disableSource(source.id);
    expect(getSource(source.id).enabled).toBe(false);
    expect(getTracks().map((track) => track.available)).toEqual([false]);
    expect(applySourceScan(source.id, await scanAudioFiles(folder))).toBe(false);
    expect(getTracks().map((track) => track.available)).toEqual([false]);

    enableSource(source.id);
    expect(getSource(source.id).enabled).toBe(true);
    expect(getTracks().map((track) => track.available)).toEqual([false]);

    expect(applySourceScan(source.id, await scanAudioFiles(folder))).toBe(true);
    expect(getTracks().map((track) => track.available)).toEqual([true]);
  });

  it("restores forgotten sources with the same track IDs", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;

    forgetSource(source.id);
    expect(getSources()).toEqual([]);
    expect(database.$client.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });

    await expect(saveSource(folder)).resolves.toEqual(source);
    applySourceScan(source.id, await scanAudioFiles(folder));
    expect(database.$client.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 1,
      id: trackId,
    });
  });

  it("moves preserved tracks when a new source replaces a forgotten overlap", async () => {
    const database = await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    await writeFile(join(child, "song.mp3"), "");
    const childSource = await saveSource(child);
    applySourceScan(childSource.id, await scanAudioFiles(child));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;
    database.$client.exec(
      "INSERT INTO track_state (track_id, starred_at) SELECT id, 1 FROM tracks",
    );
    forgetSource(childSource.id);

    const parentSource = await saveSource(parent);
    applySourceScan(parentSource.id, await scanAudioFiles(parent));

    expect(database.$client.prepare("SELECT id, source_id, available FROM tracks").get()).toEqual({
      available: 1,
      id: trackId,
      source_id: parentSource.id,
    });
    expect(database.$client.prepare("SELECT track_id, starred_at FROM track_state").get()).toEqual({
      starred_at: 1,
      track_id: trackId,
    });
  });
});

describe("track persistence", () => {
  it("persists extracted metadata and artwork", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);

    const artwork = {
      data: Uint8Array.from([1, 2, 3]),
      id: "artwork-id",
      mediaType: "image/png",
    };

    applySourceScan(
      source.id,
      ["first", "second"].map((title) => ({
        album: "Album",
        albumArtists: ["Album artist"],
        artists: ["Artist", "Guest"],
        artwork,
        bitrate: 2_304_000,
        bitsPerSample: 24,
        channelCount: 2,
        codec: "FLAC",
        discNumber: 1,
        discTotal: 2,
        duration: 180,
        fileSize: 1,
        format: "FLAC",
        genres: ["Electronic"],
        kind: "changed" as const,
        lossless: true,
        modifiedAt: 1,
        path: join(folder, `${title}.flac`),
        sampleRate: 96_000,
        trackNumber: 1,
        trackTotal: 10,
        title,
        year: 2007,
      })),
    );

    expect(getTracks()[0]).toMatchObject({
      album: "Album",
      albumArtists: ["Album artist"],
      artists: ["Artist", "Guest"],
      artworkId: artwork.id,
      bitrate: 2_304_000,
      bitsPerSample: 24,
      channelCount: 2,
      codec: "FLAC",
      discNumber: 1,
      discTotal: 2,
      genres: ["Electronic"],
      lossless: true,
      sampleRate: 96_000,
      trackNumber: 1,
      trackTotal: 10,
      year: 2007,
    });
    expect(getArtworkData(artwork.id)).toEqual({
      data: artwork.data,
      mediaType: artwork.mediaType,
    });
  });

  it("keeps the same track ID when the same path is scanned again", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    const initialTrack = getTracks()[0];

    if (!initialTrack) throw new Error("Expected the scanned track to be stored");

    expect(getTrackPath(initialTrack.id)).toBe(trackPath);
    expect(getTrackPath("missing-track")).toBeNull();

    await writeFile(trackPath, "changed");
    applySourceScan(source.id, await scanAudioFiles(folder));

    expect(
      database.$client
        .prepare("SELECT id, path, file_size FROM tracks WHERE source_id = ?")
        .get(source.id),
    ).toEqual({
      file_size: 7,
      id: initialTrack.id,
      path: trackPath,
    });
    expect(database.$client.prepare("SELECT COUNT(*) AS count FROM tracks").get()).toEqual({
      count: 1,
    });
  });

  it("gives copied and differently encoded files independent IDs", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await Promise.all([
      writeFile(join(folder, "song.mp3"), ""),
      writeFile(join(folder, "song copy.mp3"), ""),
      writeFile(join(folder, "song.flac"), ""),
    ]);
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));

    const tracks = database.$client
      .prepare("SELECT id, path FROM tracks WHERE source_id = ? ORDER BY path")
      .all(source.id);

    expect(tracks).toHaveLength(3);
    expect(new Set(tracks.map((track) => track.id)).size).toBe(3);
  });

  it("marks missing tracks unavailable and restores the same record", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "original");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;

    await rm(trackPath);
    applySourceScan(source.id, await scanAudioFiles(folder));
    expect(database.$client.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });
    expect(getTracks().map((track) => track.available)).toEqual([false]);

    await writeFile(trackPath, "restored");
    applySourceScan(source.id, await scanAudioFiles(folder));
    expect(database.$client.prepare("SELECT id, available, file_size FROM tracks").get()).toEqual({
      available: 1,
      file_size: 8,
      id: trackId,
    });
    expect(getTracks()).toMatchObject([
      {
        available: true,
        duration: null,
        format: "MP3",
        id: trackId,
        title: "song",
        path: trackPath,
      },
    ]);
  });

  it("creates a new track after a file is renamed", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const originalPath = join(folder, "before.mp3");
    await writeFile(originalPath, "");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    const originalTrack = database.$client.prepare("SELECT id FROM tracks").get();

    if (!originalTrack) throw new Error("Expected the initial scan to store the track");

    const originalId = originalTrack.id;

    await rename(originalPath, join(folder, "after.mp3"));
    applySourceScan(source.id, await scanAudioFiles(folder));

    const tracks = database.$client
      .prepare("SELECT id, title, available FROM tracks ORDER BY title")
      .all();

    expect(tracks).toEqual([
      { available: 1, id: expect.any(String), title: "after" },
      { available: 0, id: originalId, title: "before" },
    ]);
    expect(tracks[0]?.id).not.toBe(originalId);
  });
});

async function openTestDatabase(location = ":memory:") {
  await initializeDatabase({ location, migrationsFolder: join(import.meta.dirname, "../drizzle") });

  return getDatabase();
}

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}
