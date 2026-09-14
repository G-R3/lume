import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import {
  disableSource,
  enableSource,
  forgetSource,
  hasForgottenSources,
  getSources,
  getSource,
  saveSource,
} from "./library-store";
import { applySourceScan, getArtworkData, getTrackPath, getTracks } from "./track-store";

const temporaryFolders: string[] = [];

const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => {
    if (database.isOpen) database.close();
  });
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library source persistence", () => {
  it("reports whether a library has forgotten sources", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");

    expect(hasForgottenSources(database)).toBe(false);
    const source = await saveSource(database, folder);
    expect(hasForgottenSources(database)).toBe(false);
    forgetSource(database, source.id);
    expect(hasForgottenSources(database)).toBe(true);
  });

  it("reuses a source ID after the database is reopened", async () => {
    const folder = await createTemporaryFolder("lume-source-");
    const databaseFolder = await createTemporaryFolder("lume-database-");
    const databasePath = join(databaseFolder, "library.sqlite");
    const database = await openTestDatabase(databasePath);
    const source = await saveSource(database, folder);
    database.$client.close();

    const reopenedDatabase = await openTestDatabase(databasePath);
    await expect(saveSource(reopenedDatabase, folder)).resolves.toEqual(source);
    expect(getSources(reopenedDatabase)).toEqual([
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
    const database = await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    await saveSource(database, parent);

    await expect(saveSource(database, child)).rejects.toThrow("overlaps");

    const otherParent = await createTemporaryFolder("lume-source-");
    const otherChild = join(otherParent, "music");
    await mkdir(otherChild);
    await saveSource(database, otherChild);

    await expect(saveSource(database, otherParent)).rejects.toThrow("overlaps");
  });

  it("keeps tracks unavailable until a re-enabled source is scanned", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(getSource(database, source.id).trackCount).toBe(1);

    disableSource(database, source.id);
    expect(getSource(database, source.id).enabled).toBe(false);
    expect(getTracks(database).map((track) => track.available)).toEqual([false]);
    expect(applySourceScan(database, source.id, await scanAudioFiles(folder))).toBe(false);
    expect(getTracks(database).map((track) => track.available)).toEqual([false]);

    enableSource(database, source.id);
    expect(getSource(database, source.id).enabled).toBe(true);
    expect(getTracks(database).map((track) => track.available)).toEqual([false]);

    expect(applySourceScan(database, source.id, await scanAudioFiles(folder))).toBe(true);
    expect(getTracks(database).map((track) => track.available)).toEqual([true]);
  });

  it("restores forgotten sources with the same track IDs", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;

    forgetSource(database, source.id);
    expect(getSources(database)).toEqual([]);
    expect(database.$client.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });

    await expect(saveSource(database, folder)).resolves.toEqual(source);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
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
    const childSource = await saveSource(database, child);
    applySourceScan(database, childSource.id, await scanAudioFiles(child));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;
    database.$client.exec(
      "INSERT INTO track_state (track_id, starred_at) SELECT id, 1 FROM tracks",
    );
    forgetSource(database, childSource.id);

    const parentSource = await saveSource(database, parent);
    applySourceScan(database, parentSource.id, await scanAudioFiles(parent));

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
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(database, folder);

    const artwork = {
      data: Uint8Array.from([1, 2, 3]),
      id: "artwork-id",
      mediaType: "image/png",
    };

    applySourceScan(
      database,
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

    expect(getTracks(database)[0]).toMatchObject({
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
    expect(getArtworkData(database, artwork.id)).toEqual({
      data: artwork.data,
      mediaType: artwork.mediaType,
    });
  });

  it("keeps the same track ID when the same path is scanned again", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "");
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const initialTrack = getTracks(database)[0];

    if (!initialTrack) throw new Error("Expected the scanned track to be stored");

    expect(getTrackPath(database, initialTrack.id)).toBe(trackPath);
    expect(getTrackPath(database, "missing-track")).toBeNull();

    await writeFile(trackPath, "changed");
    applySourceScan(database, source.id, await scanAudioFiles(folder));

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
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));

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
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const trackId = database.$client.prepare("SELECT id FROM tracks").get()?.id;

    await rm(trackPath);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(database.$client.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });
    expect(getTracks(database).map((track) => track.available)).toEqual([false]);

    await writeFile(trackPath, "restored");
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(database.$client.prepare("SELECT id, available, file_size FROM tracks").get()).toEqual({
      available: 1,
      file_size: 8,
      id: trackId,
    });
    expect(getTracks(database)).toMatchObject([
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
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const originalTrack = database.$client.prepare("SELECT id FROM tracks").get();

    if (!originalTrack) throw new Error("Expected the initial scan to store the track");

    const originalId = originalTrack.id;

    await rename(originalPath, join(folder, "after.mp3"));
    applySourceScan(database, source.id, await scanAudioFiles(folder));

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
  const database = await openLibraryDatabase(location, join(import.meta.dirname, "../drizzle"));

  openDatabases.push(database.$client);

  return database;
}

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);

  return folder;
}
