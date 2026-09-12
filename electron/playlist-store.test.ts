import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import { applySourceScan, getTracks, saveSource } from "./library-store";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistEntry,
} from "./playlist-store";

const openDatabases: DatabaseSync[] = [];

const temporaryFolders: string[] = [];

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("playlist behavior", () => {
  it("accepts valid boundaries and preserves normalized creation order after reopening", async () => {
    const folder = await createTemporaryFolder("lume-playlists-");
    const databasePath = join(folder, "library.sqlite");
    const database = await openLibraryDatabase(databasePath);
    const maximumTitle = "T".repeat(100);
    const maximumDescription = "D".repeat(300);

    expect(() => createPlaylist(database, { description: null, title: "   " })).toThrow();
    expect(() => createPlaylist(database, { description: null, title: "T".repeat(101) })).toThrow();
    expect(() =>
      createPlaylist(database, { description: "D".repeat(301), title: "Valid" }),
    ).toThrow();

    createPlaylist(database, {
      description: `  ${maximumDescription}  `,
      title: `  ${maximumTitle}  `,
    });
    createPlaylist(database, { description: "   ", title: maximumTitle });
    database.close();

    const reopenedDatabase = await openLibraryDatabase(databasePath);
    openDatabases.push(reopenedDatabase);

    expect(
      getPlaylists(reopenedDatabase).map((playlist) => ({
        description: playlist.description,
        entryCount: playlist.entryCount,
        title: playlist.title,
      })),
    ).toEqual([
      { description: maximumDescription, entryCount: 0, title: maximumTitle },
      { description: null, entryCount: 0, title: maximumTitle },
    ]);
  });

  it("preserves entry order and identity through duplicate confirmation, removal, and deletion", async () => {
    const database = await openTestDatabase();
    const firstTrack = await addTrack(database, "First");
    const secondTrack = await addTrack(database, "Second");
    const thirdTrack = await addTrack(database, "Third");
    const playlist = createPlaylist(database, { description: null, title: "Sequence" });
    const firstEntry = addTrackToPlaylist(database, playlist.id, firstTrack.id);
    const secondEntry = addTrackToPlaylist(database, playlist.id, secondTrack.id);

    expect(addTrackToPlaylist(database, playlist.id, firstTrack.id)).toEqual({
      kind: "duplicate",
    });

    confirmAddTrackToPlaylist(database, playlist.id, firstTrack.id);

    if (firstEntry.kind !== "added" || secondEntry.kind !== "added") {
      throw new Error("Expected both distinct tracks to be added");
    }

    removePlaylistEntry(database, playlist.id, firstEntry.entry.id);

    confirmAddTrackToPlaylist(database, playlist.id, thirdTrack.id);

    const entries = getPlaylist(database, playlist.id)?.entries;
    expect(entries?.map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(entries?.map((entry) => entry.trackId)).toEqual([
      secondTrack.id,
      firstTrack.id,
      thirdTrack.id,
    ]);
    expect(new Set(entries?.map((entry) => entry.id)).size).toBe(3);
    expect(getPlaylists(database).map((summary) => summary.entryCount)).toEqual([3]);

    deletePlaylist(database, playlist.id);

    expect(getPlaylist(database, playlist.id)).toBeNull();
    expect(getTracks(database).map((track) => track.name)).toEqual(["First", "Second", "Third"]);
  });

  it("creates a playlist from a track atomically and falls back for unusable names", async () => {
    const database = await openTestDatabase();
    const namedTrack = await addTrack(database, "Night Drive");
    insertTrack(database, "blank-track", "   ");
    insertTrack(database, "long-track", "x".repeat(101));
    const namedPlaylist = createPlaylistFromTrack(database, namedTrack.id);
    const blankPlaylist = createPlaylistFromTrack(database, "blank-track");
    const longPlaylist = createPlaylistFromTrack(database, "long-track");

    expect(
      [namedPlaylist, blankPlaylist, longPlaylist].map((playlist) => ({
        title: playlist.title,
        trackId: playlist.entries[0]?.trackId,
      })),
    ).toEqual([
      { title: "Night Drive", trackId: namedTrack.id },
      { title: "New Playlist", trackId: "blank-track" },
      { title: "New Playlist", trackId: "long-track" },
    ]);

    insertTrack(database, "failing-track", "Uncommitted");
    database.exec(`
      CREATE TRIGGER reject_playlist_entry
      BEFORE INSERT ON playlist_entries
      BEGIN
        SELECT RAISE(ABORT, 'Entry insert failed');
      END;
    `);

    expect(() => createPlaylistFromTrack(database, "failing-track")).toThrow("Entry insert failed");
    expect(getPlaylists(database).map((playlist) => playlist.title)).toEqual([
      "Night Drive",
      "New Playlist",
      "New Playlist",
    ]);
  });

  it("keeps playlist membership while a track disappears and returns", async () => {
    const database = await openTestDatabase();
    const folder = await createTemporaryFolder("lume-playlist-source-");
    const trackPath = join(folder, "Fading Light.mp3");
    await writeFile(trackPath, "audio");
    const source = await saveSource(database, folder);
    applySourceScan(database, source.id, await scanAudioFiles(folder));
    const track = getTracks(database)[0];

    if (!track) throw new Error("Expected the scan to create a track");

    const playlist = createPlaylist(database, { description: null, title: "Keepers" });
    const addition = addTrackToPlaylist(database, playlist.id, track.id);

    if (addition.kind !== "added") throw new Error("Expected the track to be added");

    await rm(trackPath);
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(database, playlist.id)).toEqual({
      available: false,
      entryId: addition.entry.id,
      name: "Fading Light",
    });

    await writeFile(trackPath, "restored audio");
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(database, playlist.id)).toEqual({
      available: true,
      entryId: addition.entry.id,
      name: "Fading Light",
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

async function addTrack(database: DatabaseSync, name: string) {
  const folder = await createTemporaryFolder("lume-playlist-track-");
  await writeFile(join(folder, `${name}.mp3`), "audio");
  const source = await saveSource(database, folder);
  applySourceScan(database, source.id, await scanAudioFiles(folder));
  const track = getTracks(database).find((track) => track.name === name);

  if (track) return track;
  throw new Error(`Expected ${name} to be stored`);
}

function insertTrack(database: DatabaseSync, id: string, name: string) {
  database
    .prepare(
      `INSERT OR IGNORE INTO library_sources
        (id, path, enabled, created_at, updated_at)
      VALUES ('generated-source', '/Generated', 1, 1, 1)`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO tracks
        (id, source_id, path, name, duration, format, file_size, modified_at, available, created_at, updated_at)
      VALUES (?, 'generated-source', ?, ?, 180, 'MP3', 1, 1, 1, 1, 1)`,
    )
    .run(id, `/Generated/${id}.mp3`, name);
}

function readPlaylistTrack(database: DatabaseSync, playlistId: string) {
  const entry = getPlaylist(database, playlistId)?.entries[0];
  const track = entry ? getTracks(database).find((track) => track.id === entry.trackId) : undefined;

  if (!entry || !track) throw new Error("Expected the playlist track to exist");

  return {
    available: track.available,
    entryId: entry.id,
    name: track.name,
  };
}
