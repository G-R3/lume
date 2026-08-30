import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import { reconcileEnabledLibrarySources } from "./library-reconciliation";
import { reconcileScannedTracks, saveLibrarySource } from "./library-store";

const temporaryFolders: string[] = [];
const openDatabases: DatabaseSync[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("enabled source reconciliation", () => {
  it("isolates source failures and records their unavailable tracks", async () => {
    const database = await openTestDatabase();
    const healthyFolder = await createTemporaryFolder("lume-healthy-source-");
    const missingFolder = await createTemporaryFolder("lume-missing-source-");
    await Promise.all([
      writeFile(join(healthyFolder, "healthy.mp3"), ""),
      writeFile(join(missingFolder, "missing.mp3"), ""),
    ]);
    const healthySource = await saveLibrarySource(database, healthyFolder);
    const missingSource = await saveLibrarySource(database, missingFolder);
    reconcileScannedTracks(database, missingSource.id, await scanAudioFiles(missingFolder));
    await rm(missingFolder, { recursive: true });

    const failures = await reconcileEnabledLibrarySources(database);

    expect(failures).toEqual([
      {
        error: expect.stringContaining("ENOENT"),
        sourceId: missingSource.id,
      },
    ]);
    expect(
      database.prepare("SELECT available FROM tracks WHERE source_id = ?").get(missingSource.id),
    ).toEqual({ available: 0 });
    expect(
      database
        .prepare("SELECT last_scan_error FROM library_sources WHERE id = ?")
        .get(missingSource.id)?.last_scan_error,
    ).toEqual(expect.stringContaining("ENOENT"));
    expect(
      database
        .prepare(
          `SELECT COUNT(tracks.id) AS track_count, library_sources.last_scan_error,
          library_sources.last_scanned_at
          FROM library_sources
          LEFT JOIN tracks ON tracks.source_id = library_sources.id
          WHERE library_sources.id = ?`,
        )
        .get(healthySource.id),
    ).toEqual({ last_scan_error: null, last_scanned_at: expect.any(Number), track_count: 1 });
  });

  it("does not scan disabled sources", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-disabled-source-");
    const trackPath = join(folder, "song.mp3");
    await writeFile(trackPath, "");
    const source = await saveLibrarySource(database, folder);
    reconcileScannedTracks(database, source.id, await scanAudioFiles(folder));
    database.prepare("UPDATE library_sources SET enabled = 0 WHERE id = ?").run(source.id);
    await rm(trackPath);

    await expect(reconcileEnabledLibrarySources(database)).resolves.toEqual([]);
    expect(database.prepare("SELECT available FROM tracks").get()).toEqual({ available: 1 });
  });

  it("does not report database failures as source scan errors", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    await writeFile(join(folder, "song.mp3"), "");
    const source = await saveLibrarySource(database, folder);
    database.exec(`
      CREATE TRIGGER reject_track_insert
      BEFORE INSERT ON tracks
      BEGIN
        SELECT RAISE(ABORT, 'track write failed');
      END;
    `);

    await expect(reconcileEnabledLibrarySources(database)).rejects.toThrow("track write failed");
    expect(
      database.prepare("SELECT last_scan_error FROM library_sources WHERE id = ?").get(source.id),
    ).toEqual({ last_scan_error: null });
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
