import { writeFile } from "node:fs/promises";
import { openTestDatabase } from "./helpers/database";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";
import { closeDatabase, type LibraryDatabase } from "../electron/database";
import { librarySources, tracks } from "../electron/database/schema";
import { applySourceScan, getTracks, saveSource } from "../electron/library";
import { scanAudioFiles, trackMetadataVersion } from "../electron/library-files";
import { transition } from "../src/lib/queue";
import {
  addTrackToPlaylist,
  confirmAddTrackToPlaylist,
  createPlaylist,
  createPlaylistFromTrack,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistTrack,
} from "../electron/playlists";

describe("playlist behavior", () => {
  it("keeps the current track and queues a new addition after removing the playing entry", async () => {
    await openTestDatabase();
    const firstTrack = await addTrack("A");
    const secondTrack = await addTrack("B");
    const playlist = createPlaylistFromTrack(firstTrack.id);
    const available = new Set([firstTrack.id, secondTrack.id]);
    const titlesById = new Map(getTracks().map((track) => [track.id, track.title]));

    const started = transition(
      null,
      {
        type: "startFromSource",
        source: { kind: "playlist", playlistId: playlist.id, title: playlist.title },
        sessionId: "session",
        entries: playlist.tracks.map((entry) => ({
          sourceEntryId: entry.id,
          trackId: entry.trackId,
        })),
        startEntryId: playlist.tracks[0].id,
      },
      available,
    );

    removePlaylistTrack({ playlistId: playlist.id, playlistTrackId: playlist.tracks[0].id });

    const removed = transition(
      started,
      {
        type: "sourceEntryRemoved",
        playlistId: playlist.id,
        sourceEntryId: playlist.tracks[0].id,
      },
      available,
    );

    const addition = addTrackToPlaylist({ playlistId: playlist.id, trackId: secondTrack.id });

    if (addition.kind !== "added") throw new Error("Expected B to be added to the playlist");

    const queued = transition(
      removed,
      {
        type: "sourceEntryAdded",
        playlistId: playlist.id,
        entry: { sourceEntryId: addition.track.id, trackId: addition.track.trackId },
      },
      available,
    );

    expect({
      current: queued?.current && titlesById.get(queued.current.item.trackId),
      next: queued?.sourceQueue.map((item) => titlesById.get(item.trackId)),
    }).toEqual({ current: "A", next: ["B"] });

    const advanced = transition(queued, { type: "next", reason: "ended" }, available);
    expect(advanced?.current && titlesById.get(advanced.current.item.trackId)).toBe("B");
  });

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
        trackCount: playlist.trackCount,
        title: playlist.title,
      })),
    ).toEqual([
      { description: maximumDescription, title: maximumTitle, trackCount: 0 },
      { description: null, title: maximumTitle, trackCount: 0 },
    ]);
  });

  it("preserves track order and identity through duplicate confirmation, removal, and deletion", async () => {
    await openTestDatabase();
    const firstTrack = await addTrack("First");
    const secondTrack = await addTrack("Second");
    const thirdTrack = await addTrack("Third");

    const playlist = createPlaylist({
      description: null,
      title: "Sequence",
    });

    const firstTrackInPlaylist = addTrackToPlaylist({
      playlistId: playlist.id,
      trackId: firstTrack.id,
    });

    const secondTrackInPlaylist = addTrackToPlaylist({
      playlistId: playlist.id,
      trackId: secondTrack.id,
    });

    expect(addTrackToPlaylist({ playlistId: playlist.id, trackId: firstTrack.id })).toEqual({
      kind: "duplicate",
    });

    confirmAddTrackToPlaylist({ playlistId: playlist.id, trackId: firstTrack.id });

    if (firstTrackInPlaylist.kind !== "added" || secondTrackInPlaylist.kind !== "added") {
      throw new Error("Expected both distinct tracks to be added");
    }

    removePlaylistTrack({
      playlistId: playlist.id,
      playlistTrackId: firstTrackInPlaylist.track.id,
    });

    confirmAddTrackToPlaylist({ playlistId: playlist.id, trackId: thirdTrack.id });

    const tracks = getPlaylist(playlist.id)?.tracks;
    expect(tracks?.map((track) => track.position)).toEqual([1, 2, 3]);
    expect(tracks?.map((track) => track.trackId)).toEqual([
      secondTrack.id,
      firstTrack.id,
      thirdTrack.id,
    ]);
    expect(tracks?.every((track) => Number.isSafeInteger(track.id) && track.id > 0)).toBe(true);
    expect(new Set(tracks?.map((track) => track.id)).size).toBe(3);
    expect(getPlaylists().map((summary) => summary.trackCount)).toEqual([3]);

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
        trackId: playlist.tracks[0]?.trackId,
      })),
    ).toEqual([
      { title: "Night Drive", trackId: namedTrack.id },
      { title: "New Playlist", trackId: blankTrackId },
      { title: "New Playlist", trackId: longTrackId },
    ]);

    const failingTrackId = insertTrack(database, "failing-track", "Uncommitted");
    database.$client.exec(`
      CREATE TRIGGER reject_playlist_track
      BEFORE INSERT ON playlist_entries
      BEGIN
        SELECT RAISE(ABORT, 'Playlist track insert failed');
      END;
    `);

    expect(() => createPlaylistFromTrack(failingTrackId)).toThrow("Playlist track insert failed");
    expect(getPlaylists().map((playlist) => playlist.title)).toEqual([
      "Night Drive",
      "New Playlist",
      "New Playlist",
    ]);
  });

  it("validates membership and scopes track removal to its playlist", async () => {
    await openTestDatabase();
    const track = await addTrack("Belonging");
    const firstPlaylist = createPlaylist({ description: null, title: "First" });
    const secondPlaylist = createPlaylist({ description: null, title: "Second" });
    const addition = addTrackToPlaylist({ playlistId: firstPlaylist.id, trackId: track.id });

    if (addition.kind !== "added") throw new Error("Expected the track to be added");

    expect(() => addTrackToPlaylist({ playlistId: 999_999, trackId: track.id })).toThrow(
      "Playlist does not exist",
    );
    expect(() => addTrackToPlaylist({ playlistId: firstPlaylist.id, trackId: 999_999 })).toThrow(
      "Track does not exist",
    );
    expect(() =>
      removePlaylistTrack({
        playlistId: secondPlaylist.id,
        playlistTrackId: addition.track.id,
      }),
    ).toThrow("Playlist track does not exist in this playlist");
    expect(getPlaylist(firstPlaylist.id)?.tracks).toEqual([addition.track]);
  });
});

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
