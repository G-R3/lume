import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import { reconcileScannedTracks, saveLibrarySource } from "./library-store";

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
    expect(reopenedDatabase.prepare("SELECT id, path FROM library_sources").all()).toEqual([
      source,
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
});

describe("track persistence", () => {
  it("keeps the same track ID when the same path is scanned again", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "");
    const source = await saveLibrarySource(database, folder);
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
    const initialTrackId = database
      .prepare("SELECT id FROM tracks WHERE source_id = ?")
      .get(source.id)?.id;
    expect(initialTrackId).toBeDefined();

    await writeFile(trackPath, "changed");
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));

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
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
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
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
    const trackId = database.prepare("SELECT id FROM tracks").get()?.id;

    await rm(trackPath);
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
    expect(database.prepare("SELECT id, available FROM tracks").get()).toEqual({
      available: 0,
      id: trackId,
    });

    await writeFile(trackPath, "restored");
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
    expect(database.prepare("SELECT id, available, file_size FROM tracks").get()).toEqual({
      available: 1,
      file_size: 8,
      id: trackId,
    });
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
