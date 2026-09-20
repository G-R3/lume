import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, getDatabase, initializeDatabase, type LibraryDatabase } from "./database";
import { librarySources, tracks } from "./database/schema";
import { applySourceScan, getTracks, saveSource } from "./library";
import { scanAudioFiles, trackMetadataVersion } from "./library-files";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistEntry,
} from "./playlists";

const temporaryFolders: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("playlist behavior", () => {
  it("accepts valid boundaries and preserves normalized creation order after reopening", async () => {
    const folder = await createTemporaryFolder("lume-playlists-");
    const databasePath = join(folder, "library.sqlite");
    await openTestDatabase(databasePath);
    const maximumTitle = "T".repeat(100);
    const maximumDescription = "D".repeat(300);

    expect(() => createPlaylist({ description: null, title: "   " })).toThrow();
    expect(() => createPlaylist({ description: null, title: "T".repeat(101) })).toThrow();
    expect(() => createPlaylist({ description: "D".repeat(301), title: "Valid" })).toThrow();

    const firstPlaylist = createPlaylist({
      description: `  ${maximumDescription}  `,
      title: `  ${maximumTitle}  `,
    });

    const secondPlaylist = createPlaylist({ description: "   ", title: maximumTitle });

    expect([firstPlaylist.id, secondPlaylist.id]).toEqual([1, 2]);
    closeDatabase();

    await openTestDatabase(databasePath);

    expect(
      getPlaylists().map((playlist) => ({
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
    await openTestDatabase();
    const firstTrack = await addTrack("First");
    const secondTrack = await addTrack("Second");
    const thirdTrack = await addTrack("Third");

    const playlist = createPlaylist({
      description: null,
      title: "Sequence",
    });

    const firstEntry = addTrackToPlaylist(playlist.id, firstTrack.id);
    const secondEntry = addTrackToPlaylist(playlist.id, secondTrack.id);

    expect(addTrackToPlaylist(playlist.id, firstTrack.id)).toEqual({
      kind: "duplicate",
    });

    confirmAddTrackToPlaylist(playlist.id, firstTrack.id);

    if (firstEntry.kind !== "added" || secondEntry.kind !== "added") {
      throw new Error("Expected both distinct tracks to be added");
    }

    removePlaylistEntry(playlist.id, firstEntry.entry.id);

    confirmAddTrackToPlaylist(playlist.id, thirdTrack.id);

    const entries = getPlaylist(playlist.id)?.entries;
    expect(entries?.map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(entries?.map((entry) => entry.trackId)).toEqual([
      secondTrack.id,
      firstTrack.id,
      thirdTrack.id,
    ]);
    expect(entries?.every((entry) => Number.isSafeInteger(entry.id) && entry.id > 0)).toBe(true);
    expect(new Set(entries?.map((entry) => entry.id)).size).toBe(3);
    expect(getPlaylists().map((summary) => summary.entryCount)).toEqual([3]);

    deletePlaylist(playlist.id);

    expect(getPlaylist(playlist.id)).toBeNull();
    expect(getTracks().map((track) => track.title)).toEqual(["First", "Second", "Third"]);
  });

  it("creates a playlist from a track atomically and falls back for unusable names", async () => {
    const database = await openTestDatabase();
    const namedTrack = await addTrack("Night Drive");
    const blankTrackId = insertTrack(database, "blank-track", "   ");
    const longTrackId = insertTrack(database, "long-track", "x".repeat(101));
    const namedPlaylist = createPlaylistFromTrack(namedTrack.id);
    const blankPlaylist = createPlaylistFromTrack(blankTrackId);
    const longPlaylist = createPlaylistFromTrack(longTrackId);

    expect(
      [namedPlaylist, blankPlaylist, longPlaylist].map((playlist) => ({
        title: playlist.title,
        trackId: playlist.entries[0]?.trackId,
      })),
    ).toEqual([
      { title: "Night Drive", trackId: namedTrack.id },
      { title: "New Playlist", trackId: blankTrackId },
      { title: "New Playlist", trackId: longTrackId },
    ]);

    const failingTrackId = insertTrack(database, "failing-track", "Uncommitted");
    database.$client.exec(`
      CREATE TRIGGER reject_playlist_entry
      BEFORE INSERT ON playlist_entries
      BEGIN
        SELECT RAISE(ABORT, 'Entry insert failed');
      END;
    `);

    expect(() => createPlaylistFromTrack(failingTrackId)).toThrow("Entry insert failed");
    expect(getPlaylists().map((playlist) => playlist.title)).toEqual([
      "Night Drive",
      "New Playlist",
      "New Playlist",
    ]);
  });

  it("validates membership and scopes entry removal to its playlist", async () => {
    await openTestDatabase();
    const track = await addTrack("Belonging");
    const firstPlaylist = createPlaylist({ description: null, title: "First" });
    const secondPlaylist = createPlaylist({ description: null, title: "Second" });
    const addition = addTrackToPlaylist(firstPlaylist.id, track.id);

    if (addition.kind !== "added") throw new Error("Expected the track to be added");

    expect(() => addTrackToPlaylist(999_999, track.id)).toThrow("Playlist does not exist");
    expect(() => addTrackToPlaylist(firstPlaylist.id, 999_999)).toThrow("Track does not exist");
    expect(() => removePlaylistEntry(secondPlaylist.id, addition.entry.id)).toThrow(
      "Playlist entry does not exist in this playlist",
    );
    expect(getPlaylist(firstPlaylist.id)?.entries).toEqual([addition.entry]);
  });

  it("keeps playlist membership while a track disappears and returns", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-playlist-source-");
    const trackPath = join(folder, "Fading Light.mp3");
    await writeFile(trackPath, "audio");
    const source = await saveSource(folder);
    applySourceScan(source.id, await scanAudioFiles(folder));
    const track = getTracks()[0];

    if (!track) throw new Error("Expected the scan to create a track");

    const playlist = createPlaylist({ description: null, title: "Keepers" });
    const addition = addTrackToPlaylist(playlist.id, track.id);

    if (addition.kind !== "added") throw new Error("Expected the track to be added");

    await rm(trackPath);
    applySourceScan(source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(playlist.id)).toEqual({
      available: false,
      entryId: addition.entry.id,
      title: "Fading Light",
    });

    await writeFile(trackPath, "restored audio");
    applySourceScan(source.id, await scanAudioFiles(folder));

    expect(readPlaylistTrack(playlist.id)).toEqual({
      available: true,
      entryId: addition.entry.id,
      title: "Fading Light",
    });
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

async function addTrack(title: string) {
  const folder = await createTemporaryFolder("lume-playlist-track-");
  await writeFile(join(folder, `${title}.mp3`), "audio");
  const source = await saveSource(folder);
  applySourceScan(source.id, await scanAudioFiles(folder));
  const track = getTracks().find((track) => track.title === title);

  if (track) return track;
  throw new Error(`Expected ${title} to be stored`);
}

function insertTrack(database: LibraryDatabase, name: string, title: string) {
  database
    .insert(librarySources)
    .values({
      createdAt: 1,
      enabled: true,
      path: "/Generated",
      updatedAt: 1,
    })
    .onConflictDoNothing({ target: librarySources.path })
    .run();

  const source = database
    .select({ id: librarySources.id })
    .from(librarySources)
    .where(eq(librarySources.path, "/Generated"))
    .get();

  if (!source) throw new Error("Expected the generated source to exist");

  return database
    .insert(tracks)
    .values({
      albumArtists: [],
      artists: [],
      available: true,
      createdAt: 1,
      duration: 180,
      fileSize: 1,
      format: "MP3",
      genres: [],
      metadataVersion: trackMetadataVersion,
      modifiedAt: 1,
      path: `/Generated/${name}.mp3`,
      sourceId: source.id,
      title,
      updatedAt: 1,
    })
    .returning({ id: tracks.id })
    .get().id;
}

function readPlaylistTrack(playlistId: number) {
  const entry = getPlaylist(playlistId)?.entries[0];
  const track = entry ? getTracks().find((track) => track.id === entry.trackId) : undefined;

  if (!entry || !track) throw new Error("Expected the playlist track to exist");

  return {
    available: track.available,
    entryId: entry.id,
    title: track.title,
  };
}
