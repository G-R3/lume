import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import {
  applySourceScan,
  disableSource,
  enableSource,
  forgetLibrarySource,
  getAvailableTracks,
  getLibrarySources,
  getSource,
  saveLibrarySource,
} from "./library-store";

const temporaryFolders: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("library source persistence", () => {
  it("reuses a source ID after the database is reopened", async () => {
    const folder = await createTemporaryFolder("lume-source-");
    const databaseFolder = await createTemporaryFolder("lume-database-");
    const databasePath = join(databaseFolder, "library.sqlite");
    const database = await openLibraryDatabase(databasePath);
    const source = await saveLibrarySource(database, folder);
    database.close();

    const reopenedDatabase = await openLibraryDatabase(databasePath);
    openDatabases.push(reopenedDatabase);
    await expect(saveLibrarySource(reopenedDatabase, folder)).resolves.toEqual(source);
    expect(getLibrarySources(reopenedDatabase)).toEqual([
      {
        enabled: true,
        id: source.id,
        lastScanError: null,
        lastScannedAt: null,
        path: source.path,
      },
    ]);
  });

  it("rejects nested and containing source folders", async () => {
    const database = await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    await saveLibrarySource(database, parent);

    await expect(saveLibrarySource(database, child)).rejects.toThrow("overlaps");

    const otherParent = await createTemporaryFolder("lume-source-");
    const otherChild = join(otherParent, "music");
    await mkdir(otherChild);
    await saveLibrarySource(database, otherChild);

    await expect(saveLibrarySource(database, otherParent)).rejects.toThrow("overlaps");
  });

  it("keeps tracks unavailable until a re-enabled source is scanned", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveLibrarySource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    disableSource(database, source.id);
    expect(database.prepare("SELECT enabled FROM library_sources").get()).toEqual({ enabled: 0 });
    expect(getSource(database, source.id).enabled).toBe(false);
    expect(getAvailableTracks(database)).toEqual([]);

    enableSource(database, source.id);
    expect(database.prepare("SELECT enabled FROM library_sources").get()).toEqual({ enabled: 1 });
    expect(getAvailableTracks(database)).toEqual([]);

    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(getAvailableTracks(database)).toHaveLength(1);
  });

  it("restores forgotten sources with the same track IDs", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveLibrarySource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const trackId = database.prepare("SELECT id FROM tracks").get()?.id;

    forgetLibrarySource(database, source.id);
    expect(getLibrarySources(database)).toEqual([]);
    expect(database.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });

    await expect(saveLibrarySource(database, folder)).resolves.toEqual(source);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(database.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 1,
      id: trackId,
    });
  });

  it("rejects overlap with a forgotten source", async () => {
    const database = await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    const source = await saveLibrarySource(database, parent);
    forgetLibrarySource(database, source.id);

    await expect(saveLibrarySource(database, child)).rejects.toThrow("overlaps");
  });
});

describe("track persistence", () => {
  it("keeps the same track ID when the same path is scanned again", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "");
    const source = await saveLibrarySource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const initialTrackId = database
      .prepare("SELECT id FROM tracks WHERE source_id = ?")
      .get(source.id)?.id;
    expect(initialTrackId).toBeDefined();

    await writeFile(trackPath, "changed");
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    expect(
      database.prepare("SELECT id, path, file_size FROM tracks WHERE source_id = ?").get(source.id),
    ).toEqual({
      file_size: 7,
      id: initialTrackId,
      path: trackPath,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM tracks").get()).toEqual({ count: 1 });
  });

  it("gives copied and differently encoded files independent IDs", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await Promise.all([
      writeFile(join(folder, "song.mp3"), ""),
      writeFile(join(folder, "song copy.mp3"), ""),
      writeFile(join(folder, "song.flac"), ""),
    ]);
    const source = await saveLibrarySource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const tracks = database
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
    const source = await saveLibrarySource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const trackId = database.prepare("SELECT id FROM tracks").get()?.id;

    await rm(trackPath);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(database.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });
    expect(getAvailableTracks(database)).toEqual([]);

    await writeFile(trackPath, "restored");
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    expect(database.prepare("SELECT id, available, file_size FROM tracks").get()).toEqual({
      available: 1,
      file_size: 8,
      id: trackId,
    });
    expect(getAvailableTracks(database)).toEqual([
      {
        duration: null,
        format: "MP3",
        id: trackId,
        name: "song",
        path: trackPath,
      },
    ]);
  });
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
