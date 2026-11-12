import { writeFile } from "node:fs/promises";
import { openTestDatabase } from "./helpers/database";
import { libraryTracks, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { closeDatabase } from "../electron/database";
import { saveSource, setTracksLiked } from "../electron/library";
import { scanAudioFiles } from "../electron/library-files";
import { transition } from "../src/lib/queue/transition";
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistTracks,
} from "../electron/playlists";
import { queueContext } from "./helpers/queue-context";
import { defaultSort } from "../src/lib/track-sort";

describe("playlist behavior", () => {
  it("keeps the current track and queues a new addition after removing the playing entry", async () => {
    await openTestDatabase();
    const firstTrack = await addTrack("A");
    const secondTrack = await addTrack("B");
    const playlist = createPlaylist({ description: null, title: "A", trackIds: [firstTrack.id] });
    const context = queueContext([firstTrack.id, secondTrack.id]);
    const titlesById = new Map(libraryTracks().map((track) => [track.id, track.title]));

    const started = transition(
      null,
      {
        type: "startSession",
        sort: defaultSort,
        filter: null,
        source: { kind: "playlist", playlistId: playlist.id, title: playlist.title },
        sessionId: "session",
        entries: playlist.tracks.map((entry) => ({
          sourceEntryId: entry.id,
          trackId: entry.trackId,
        })),
        start: { kind: "entry", sourceEntryId: playlist.tracks[0].id },
        shuffled: false,
      },
      context,
    );

    removePlaylistTracks({ playlistId: playlist.id, playlistTrackIds: [playlist.tracks[0].id] });

    const removed = transition(
      started,
      {
        type: "sourceEntriesRemoved",
        playlistId: playlist.id,
        sourceEntryIds: [playlist.tracks[0].id],
      },
      context,
    );

    const addition = addTracksToPlaylist({
      duplicates: "check",
      playlistId: playlist.id,
      trackIds: [secondTrack.id],
    });

    if (addition.kind !== "added") throw new Error("Expected B to be added to the playlist");

    const queued = transition(
      removed,
      {
        type: "sourceEntriesAdded",
        playlistId: playlist.id,
        entries: addition.tracks.map((track) => ({
          sourceEntryId: track.id,
          trackId: track.trackId,
        })),
      },
      context,
    );

    expect({
      current: queued?.current && titlesById.get(queued.current.item.trackId),
      next: queued?.sourceQueue.map((item) => titlesById.get(item.trackId)),
    }).toEqual({ current: "A", next: ["B"] });

    const advanced = transition(queued, { type: "next" }, context);
    expect(advanced?.current && titlesById.get(advanced.current.item.trackId)).toBe("B");
  });

  it("accepts valid boundaries and preserves normalized creation order after reopening", async () => {
    const folder = await createTemporaryFolder("lume-playlists-");
    const databasePath = join(folder, "library.sqlite");
    await openTestDatabase(databasePath);
    const maximumTitle = "T".repeat(100);
    const maximumDescription = "D".repeat(300);

    expect(() => createPlaylist({ description: null, title: "   ", trackIds: [] })).toThrow();
    expect(() =>
      createPlaylist({ description: null, title: "T".repeat(101), trackIds: [] }),
    ).toThrow();
    expect(() =>
      createPlaylist({ description: "D".repeat(301), title: "Valid", trackIds: [] }),
    ).toThrow();

    const firstPlaylist = createPlaylist({
      description: `  ${maximumDescription}  `,
      title: `  ${maximumTitle}  `,
      trackIds: [],
    });

    const secondPlaylist = createPlaylist({
      description: "   ",
      title: maximumTitle,
      trackIds: [],
    });

    expect([firstPlaylist.id, secondPlaylist.id]).toEqual([1, 2]);
    expect(firstPlaylist.tracks).toEqual([]);
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
      trackIds: [firstTrack.id, secondTrack.id],
    });

    expect(
      addTracksToPlaylist({
        duplicates: "check",
        playlistId: playlist.id,
        trackIds: [firstTrack.id],
      }),
    ).toEqual({ alreadyInPlaylist: 1, kind: "duplicate", newTrackCount: 0 });

    addTracksToPlaylist({
      duplicates: "allow",
      playlistId: playlist.id,
      trackIds: [firstTrack.id],
    });

    removePlaylistTracks({ playlistId: playlist.id, playlistTrackIds: [playlist.tracks[0].id] });

    addTracksToPlaylist({
      duplicates: "check",
      playlistId: playlist.id,
      trackIds: [thirdTrack.id],
    });

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
    expect(libraryTracks().map((track) => track.title)).toEqual(["First", "Second", "Third"]);
  });

  it("creates a playlist and its memberships together or not at all", async () => {
    const database = await openTestDatabase();
    const first = await addTrack("Night");
    const second = await addTrack("Drive");

    const playlist = createPlaylist({
      description: null,
      title: "Night Drive",
      trackIds: [second.id, first.id, second.id],
    });

    expect(playlist.tracks.map((track) => track.trackId)).toEqual([second.id, first.id, second.id]);
    expect(getPlaylist(playlist.id)).toEqual(playlist);

    expect(() =>
      createPlaylist({ description: null, title: "Missing", trackIds: [first.id, 999_999] }),
    ).toThrow("Track does not exist");

    database.$client.exec(`
      CREATE TRIGGER reject_playlist_track
      BEFORE INSERT ON playlist_entries
      BEGIN
        SELECT RAISE(ABORT, 'Playlist track insert failed');
      END;
    `);

    expect(() =>
      createPlaylist({ description: null, title: "Uncommitted", trackIds: [first.id] }),
    ).toThrow("Playlist track insert failed");
    expect(getPlaylists().map((summary) => summary.title)).toEqual(["Night Drive"]);
  });

  it("appends ordered occurrences, repeats included, after the existing entries", async () => {
    await openTestDatabase();
    const first = await addTrack("One");
    const second = await addTrack("Two");
    const playlist = createPlaylist({ description: null, title: "Mix", trackIds: [first.id] });

    const addition = addTracksToPlaylist({
      duplicates: "check",
      playlistId: playlist.id,
      trackIds: [second.id, second.id],
    });

    if (addition.kind !== "added") throw new Error("Expected the repeats to be added");

    expect(addition.tracks.map(({ position, trackId }) => ({ position, trackId }))).toEqual([
      { position: 1, trackId: second.id },
      { position: 2, trackId: second.id },
    ]);
    expect(getPlaylist(playlist.id)?.tracks).toEqual([...playlist.tracks, ...addition.tracks]);
  });

  it("writes nothing when any added track is already in the playlist until confirmed", async () => {
    await openTestDatabase();
    const first = await addTrack("Old");
    const second = await addTrack("New");
    const playlist = createPlaylist({ description: null, title: "Mix", trackIds: [first.id] });
    const request = [second.id, first.id, first.id];

    expect(
      addTracksToPlaylist({ duplicates: "check", playlistId: playlist.id, trackIds: request }),
    ).toEqual({ alreadyInPlaylist: 2, kind: "duplicate", newTrackCount: 1 });
    expect(getPlaylist(playlist.id)?.tracks).toEqual(playlist.tracks);

    const confirmed = addTracksToPlaylist({
      duplicates: "allow",
      playlistId: playlist.id,
      trackIds: request,
    });

    if (confirmed.kind !== "added") throw new Error("Expected the confirmed add to write");

    expect(getPlaylist(playlist.id)?.tracks.map((track) => track.trackId)).toEqual([
      first.id,
      ...request,
    ]);
  });

  it("adds only the new tracks once each, in target order, when skipping duplicates", async () => {
    await openTestDatabase();
    const old = await addTrack("Old");
    const first = await addTrack("First");
    const second = await addTrack("Second");
    const playlist = createPlaylist({ description: null, title: "Mix", trackIds: [old.id] });
    const request = [second.id, old.id, first.id, second.id, old.id];

    expect(
      addTracksToPlaylist({ duplicates: "check", playlistId: playlist.id, trackIds: request }),
    ).toEqual({ alreadyInPlaylist: 2, kind: "duplicate", newTrackCount: 2 });

    const skipped = addTracksToPlaylist({
      duplicates: "skip",
      playlistId: playlist.id,
      trackIds: request,
    });

    if (skipped.kind !== "added") throw new Error("Expected the new tracks to be added");

    expect(skipped.tracks.map(({ position, trackId }) => ({ position, trackId }))).toEqual([
      { position: 1, trackId: second.id },
      { position: 2, trackId: first.id },
    ]);
    expect(getPlaylist(playlist.id)?.tracks).toEqual([...playlist.tracks, ...skipped.tracks]);
  });

  it("writes nothing when skipping duplicates and every target is already there", async () => {
    await openTestDatabase();
    const track = await addTrack("Kept");
    const playlist = createPlaylist({ description: null, title: "Mix", trackIds: [track.id] });
    const before = getPlaylists();

    expect(
      addTracksToPlaylist({
        duplicates: "skip",
        playlistId: playlist.id,
        trackIds: [track.id, track.id],
      }),
    ).toEqual({ kind: "added", tracks: [] });
    expect(getPlaylist(playlist.id)?.tracks).toEqual(playlist.tracks);
    expect(getPlaylists()).toEqual(before);
  });

  it("skips duplicates across more distinct tracks than SQLite binds in one statement", async () => {
    const database = await openTestDatabase();
    const seed = await addTrack("Seed");

    database.$client.exec(`
      WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2500)
      INSERT INTO tracks (source_id, path, title, format, file_size, modified_at, missing_since,
        created_at, updated_at, artists, album_artists, genres, metadata_version)
      SELECT source_id, path || '-' || i, 'Bulk ' || i, format, file_size, modified_at, missing_since,
        created_at, updated_at, artists, album_artists, genres, metadata_version
      FROM tracks, n WHERE tracks.id = ${seed.id}
    `);

    const bulkIds = libraryTracks()
      .filter((track) => track.title.startsWith("Bulk "))
      .map((track) => track.id)
      .sort((left, right) => left - right);

    const existing = bulkIds.filter((_, index) => index % 2 === 0);
    const playlist = createPlaylist({ description: null, title: "Bulk", trackIds: existing });
    const request = [...bulkIds].reverse().flatMap((id) => [id, id]);

    expect(bulkIds).toHaveLength(2500);
    expect(
      addTracksToPlaylist({ duplicates: "check", playlistId: playlist.id, trackIds: request }),
    ).toEqual({ alreadyInPlaylist: 2500, kind: "duplicate", newTrackCount: 1250 });

    const skipped = addTracksToPlaylist({
      duplicates: "skip",
      playlistId: playlist.id,
      trackIds: request,
    });

    if (skipped.kind !== "added") throw new Error("Expected the new tracks to be added");

    const added = [...bulkIds].reverse().filter((_, index) => index % 2 === 0);

    expect(skipped.tracks.map((entry) => entry.trackId)).toEqual(added);
    expect(skipped.tracks.map((entry) => entry.position)).toEqual(
      added.map((_, index) => existing.length + index),
    );
    expect(getPlaylist(playlist.id)?.tracks.map((entry) => entry.trackId)).toEqual([
      ...existing,
      ...added,
    ]);
  });

  it("rejects the whole add when any target is missing", async () => {
    await openTestDatabase();
    const track = await addTrack("Real");
    const playlist = createPlaylist({ description: null, title: "Mix", trackIds: [] });

    expect(() =>
      addTracksToPlaylist({
        duplicates: "allow",
        playlistId: playlist.id,
        trackIds: [track.id, 999_999],
      }),
    ).toThrow("Track does not exist");
    expect(() =>
      addTracksToPlaylist({ duplicates: "check", playlistId: 999_999, trackIds: [track.id] }),
    ).toThrow("Playlist does not exist");
    expect(getPlaylist(playlist.id)?.tracks).toEqual([]);
  });

  it("adds and removes more entries than SQLite binds in one statement", async () => {
    await openTestDatabase();
    const track = await addTrack("Loop");
    const playlist = createPlaylist({ description: null, title: "Loop", trackIds: [] });
    const occurrences = Array.from({ length: 33_000 }, () => track.id);

    const addition = addTracksToPlaylist({
      duplicates: "check",
      playlistId: playlist.id,
      trackIds: occurrences,
    });

    if (addition.kind !== "added") throw new Error("Expected every occurrence to be added");

    expect(addition.tracks.map((entry) => entry.position)).toEqual(
      occurrences.map((_, index) => index),
    );

    removePlaylistTracks({
      playlistId: playlist.id,
      playlistTrackIds: addition.tracks.map((entry) => entry.id),
    });

    expect(getPlaylist(playlist.id)?.tracks).toEqual([]);
    expect(libraryTracks().map((entry) => entry.title)).toEqual(["Loop"]);
  });

  it("returns each entry's membership time as addedAt", async () => {
    const database = await openTestDatabase();
    const first = await addTrack("Early");
    const second = await addTrack("Late");
    const playlist = createPlaylist({ description: null, title: "Times", trackIds: [first.id] });

    const addition = addTracksToPlaylist({
      duplicates: "check",
      playlistId: playlist.id,
      trackIds: [second.id],
    });

    if (addition.kind !== "added") throw new Error("Expected Late to be added");

    const membershipTimes = () =>
      database.$client
        .prepare("SELECT id, created_at AS addedAt FROM playlist_entries ORDER BY position")
        .all();

    expect(
      [...playlist.tracks, ...addition.tracks].map(({ id, addedAt }) => ({ id, addedAt })),
    ).toEqual(membershipTimes());

    database.$client.prepare("UPDATE playlist_entries SET created_at = id * 1000").run();

    expect(getPlaylist(playlist.id)?.tracks.map(({ id, addedAt }) => ({ id, addedAt }))).toEqual(
      [playlist.tracks[0].id, addition.tracks[0].id].map((id) => ({ id, addedAt: id * 1000 })),
    );
  });

  it("removes nothing unless every entry belongs to the playlist", async () => {
    await openTestDatabase();
    const track = await addTrack("Belonging");

    const firstPlaylist = createPlaylist({
      description: null,
      title: "First",
      trackIds: [track.id, track.id],
    });

    const secondPlaylist = createPlaylist({
      description: null,
      title: "Second",
      trackIds: [track.id],
    });

    expect(() =>
      removePlaylistTracks({
        playlistId: firstPlaylist.id,
        playlistTrackIds: [firstPlaylist.tracks[0].id, secondPlaylist.tracks[0].id],
      }),
    ).toThrow("Playlist track does not exist in this playlist");
    expect(getPlaylist(firstPlaylist.id)?.tracks).toEqual(firstPlaylist.tracks);
    expect(getPlaylist(secondPlaylist.id)?.tracks).toEqual(secondPlaylist.tracks);
  });
});

describe("track likes", () => {
  it("likes each distinct track once and unlikes them together", async () => {
    await openTestDatabase();
    const first = await addTrack("Left");
    const second = await addTrack("Right");

    const liked = setTracksLiked({ liked: true, trackIds: [first.id, second.id, first.id] }).likes;

    expect(liked).toEqual([
      { likedAt: expect.any(Number), trackId: first.id },
      { likedAt: liked[0].likedAt, trackId: second.id },
    ]);
    expect(libraryTracks().map((track) => track.likedAt)).toEqual([
      liked[0].likedAt,
      liked[0].likedAt,
    ]);

    expect(setTracksLiked({ liked: false, trackIds: [second.id, first.id] }).likes).toEqual([
      { likedAt: null, trackId: second.id },
      { likedAt: null, trackId: first.id },
    ]);
    expect(libraryTracks().map((track) => track.likedAt)).toEqual([null, null]);
  });

  it("changes no like when any track is missing", async () => {
    await openTestDatabase();
    const track = await addTrack("Kept");

    expect(() => setTracksLiked({ liked: true, trackIds: [track.id, 999_999] })).toThrow(
      "Track does not exist",
    );
    expect(libraryTracks().map((entry) => entry.likedAt)).toEqual([null]);
  });
});

async function addTrack(title: string) {
  const folder = await createTemporaryFolder("lume-playlist-track-");
  await writeFile(join(folder, `${title}.mp3`), "audio");
  const source = await saveSource(folder);
  await scanWith(source.id, await scanAudioFiles(folder));
  const track = libraryTracks().find((track) => track.title === title);

  if (track) return track;
  throw new Error(`Expected ${title} to be stored`);
}
