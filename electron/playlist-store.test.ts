import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openLibraryDatabase, type LibraryDatabase } from "./database";
import { scanAudioFiles } from "./library";
import { saveSource } from "./library-store";
import { applySourceScan, getTracks } from "./track-store";
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
  openDatabases.splice(0).forEach((database) => {
    if (database.isOpen) database.close();
  });
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("playlist behavior", () => {
  it("accepts valid boundaries and preserves normalized creation order after reopening", async () => {
    const folder = await createTemporaryFolder("lume-playlists-");
    const databasePath = join(folder, "library.sqlite");
    const database = await openTestDatabase(databasePath);
    const maximumTitle = "T".repeat(100);
    const maximumDescription = "D".repeat(300);

    expect(() => createPlaylist(database.$client, { description: null, title: "   " })).toThrow();
    expect(() =>
      createPlaylist(database.$client, { description: null, title: "T".repeat(101) }),
    ).toThrow();
    expect(() =>
      createPlaylist(database.$client, { description: "D".repeat(301), title: "Valid" }),
    ).toThrow();

    createPlaylist(database.$client, {
      description: `  ${maximumDescription}  `,
      title: `  ${maximumTitle}  `,
    });
    createPlaylist(database.$client, { description: "   ", title: maximumTitle });
    database.$client.close();

    const reopenedDatabase = await openTestDatabase(databasePath);

    expect(
      getPlaylists(reopenedDatabase.$client).map((playlist) => ({
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

    const playlist = createPlaylist(database.$client, {
      description: null,
      title: "Sequence",
    });

    const firstEntry = addTrackToPlaylist(database.$client, playlist.id, firstTrack.id);
    const secondEntry = addTrackToPlaylist(database.$client, playlist.id, secondTrack.id);

    expect(addTrackToPlaylist(database.$client, playlist.id, firstTrack.id)).toEqual({
      kind: "duplicate",
    });

    confirmAddTrackToPlaylist(database.$client, playlist.id, firstTrack.id);

    if (firstEntry.kind !== "added" || secondEntry.kind !== "added") {
      throw new Error("Expected both distinct tracks to be added");
    }

    removePlaylistEntry(database.$client, playlist.id, firstEntry.entry.id);

    confirmAddTrackToPlaylist(database.$client, playlist.id, thirdTrack.id);

    const entries = getPlaylist(database.$client, playlist.id)?.entries;
    expect(entries?.map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(entries?.map((entry) => entry.trackId)).toEqual([
      secondTrack.id,
      firstTrack.id,
      thirdTrack.id,
    ]);
    expect(new Set(entries?.map((entry) => entry.id)).size).toBe(3);
    expect(getPlaylists(database.$client).map((summary) => summary.entryCount)).toEqual([3]);

    deletePlaylist(database.$client, playlist.id);

    expect(getPlaylist(database.$client, playlist.id)).toBeNull();
    expect(getTracks(database).map((track) => track.title)).toEqual(["First", "Second", "Third"]);
  });

  it("creates a playlist from a track atomically and falls back for unusable names", async () => {
    const database = await openTestDatabase();
    const namedTrack = await addTrack(database, "Night Drive");
    insertTrack(database, "blank-track", "   ");
    insertTrack(database, "long-track", "x".repeat(101));
    const namedPlaylist = createPlaylistFromTrack(database.$client, namedTrack.id);
    const blankPlaylist = createPlaylistFromTrack(database.$client, "blank-track");
    const longPlaylist = createPlaylistFromTrack(database.$client, "long-track");

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
    database.$client.exec(`
      CREATE TRIGGER reject_playlist_entry
      BEFORE INSERT ON playlist_entries
      BEGIN
        SELECT RAISE(ABORT, 'Entry insert failed');
      END;
    `);

    expect(() => createPlaylistFromTrack(database.$client, "failing-track")).toThrow(
      "Entry insert failed",
    );
    expect(getPlaylists(database.$client).map((playlist) => playlist.title)).toEqual([
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

    const playlist = createPlaylist(database.$client, { description: null, title: "Keepers" });
    const addition = addTrackToPlaylist(database.$client, playlist.id, track.id);

    if (addition.kind !== "added") throw new Error("Expected the track to be added");

    await rm(trackPath);
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(database, playlist.id)).toEqual({
      available: false,
      entryId: addition.entry.id,
      title: "Fading Light",
    });

    await writeFile(trackPath, "restored audio");
    applySourceScan(database, source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(database, playlist.id)).toEqual({
      available: true,
      entryId: addition.entry.id,
      title: "Fading Light",
    });
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

async function addTrack(database: LibraryDatabase, title: string) {
  const folder = await createTemporaryFolder("lume-playlist-track-");
  await writeFile(join(folder, `${title}.mp3`), "audio");
  const source = await saveSource(database, folder);
  applySourceScan(database, source.id, await scanAudioFiles(folder));
  const track = getTracks(database).find((track) => track.title === title);

  if (track) return track;
  throw new Error(`Expected ${title} to be stored`);
}

function insertTrack(database: LibraryDatabase, id: string, title: string) {
  database.$client
    .prepare(
      `INSERT OR IGNORE INTO library_sources
        (id, path, enabled, created_at, updated_at)
      VALUES ('generated-source', '/Generated', 1, 1, 1)`,
    )
    .run();
  database.$client
    .prepare(
      `INSERT INTO tracks
        (id, source_id, path, title, duration, format, file_size, modified_at, available,
          created_at, updated_at, artists, album_artists, genres, metadata_version)
      VALUES (?, 'generated-source', ?, ?, 180, 'MP3', 1, 1, 1, 1, 1, '[]', '[]', '[]', 1)`,
    )
    .run(id, `/Generated/${id}.mp3`, title);
}

function readPlaylistTrack(database: LibraryDatabase, playlistId: string) {
  const entry = getPlaylist(database.$client, playlistId)?.entries[0];
  const track = entry ? getTracks(database).find((track) => track.id === entry.trackId) : undefined;

  if (!entry || !track) throw new Error("Expected the playlist track to exist");

  return {
    available: track.available,
    entryId: entry.id,
    title: track.title,
  };
}
