import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { failScan, libraryTracks, readLibrary, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import {
  disableSource,
  getLibrarySnapshotJson,
  getLibraryUpdate,
  saveSource,
  setTracksLiked,
} from "../electron/library";
import type { ScannedTrack } from "../electron/library-files";
import { createPlaylist } from "../electron/playlists";
import { parseLibrarySnapshot } from "../shared/lib";

describe("library transport from stored rows", () => {
  it("sends first-run before any source exists", async () => {
    await openTestDatabase();

    expect(parseLibrarySnapshot(getLibrarySnapshotJson())).toStrictEqual({
      kind: "first-run",
      revision: expect.any(Number),
    });
  });

  it("numbers every payload above the ones built before it", async () => {
    await openTestDatabase();
    const firstRun = parseLibrarySnapshot(getLibrarySnapshotJson());
    const folder = await createTemporaryFolder("lume-source-");
    const source = await saveSource(folder);
    await scanWith(source.id, [scannedTrack(join(folder, "song.mp3"), {})]);
    const song = trackTitled("song");
    const library = parseLibrarySnapshot(getLibrarySnapshotJson());
    const like = setTracksLiked({ liked: true, trackIds: [song.id] });
    const sources = getLibraryUpdate("tracks-unchanged");
    const reread = parseLibrarySnapshot(getLibrarySnapshotJson());

    if (sources?.kind !== "sources") throw new Error("Expected a sources update");

    const revisions = [firstRun, library, like, sources, reread].map((payload) => payload.revision);

    expect(revisions).toStrictEqual(revisions.toSorted((left, right) => left - right));
    expect(new Set(revisions).size).toBe(revisions.length);
  });

  it("sends every stored field in its own position", async () => {
    const database = await openTestDatabase();
    database.$client.exec(`
      INSERT INTO app_state (id, onboarded_at) VALUES (1, 1);
      INSERT INTO library_sources (id, path, status, last_scan_outcome, last_scanned_at, created_at, updated_at)
        VALUES (1, '/s', 'active', 'ok', 3, 1, 2);
      INSERT INTO artwork (id, media_type, data) VALUES ('art-s', 'image/png', x'00');
      INSERT INTO tracks (id, source_id, path, title, duration, format, file_size, modified_at,
        available, created_at, updated_at, artists, album, album_artists, artwork_id, year,
        track_number, track_total, disc_number, disc_total, genres, codec, bitrate, sample_rate,
        bits_per_sample, channel_count, lossless, metadata_version)
      VALUES (113, 1, '/s/t.flac', 'title-s', 101.5, 'format-s', 3, 4, 1, 111, 5, '["artist-s"]',
        'album-s', '["album-artist-s"]', 'art-s', 110, 106, 107, 108, 109, '["genre-s"]',
        'codec-s', 102.25, 103, 104, 105, 0, 1);
      INSERT INTO track_state (track_id, liked_at) VALUES (113, 112);
    `);

    const decoded = parseLibrarySnapshot(getLibrarySnapshotJson());

    if (decoded.kind !== "library") throw new Error("Expected a populated library");
    expect(decoded.playlists).toStrictEqual([]);
    expect(decoded.sources).toStrictEqual([
      { id: 1, path: "/s", status: { kind: "scanned", scannedAt: 3, trackCount: 1 } },
    ]);
    expect(decoded.tracks).toStrictEqual([
      {
        addedAt: 111,
        album: "album-s",
        albumArtists: ["album-artist-s"],
        artists: ["artist-s"],
        artworkUrl: "lume://app/artwork/art-s",
        available: true,
        bitrate: 102.25,
        bitsPerSample: 104,
        channelCount: 105,
        codec: "codec-s",
        discNumber: 108,
        discTotal: 109,
        duration: 101.5,
        format: "format-s",
        genres: ["genre-s"],
        id: 113,
        likedAt: 112,
        lossless: false,
        title: "title-s",
        sampleRate: 103,
        trackNumber: 106,
        trackTotal: 107,
        url: "lume://app/media/113",
        year: 110,
      },
    ]);
  });

  it("sends each stored source state as one status", async () => {
    const database = await openTestDatabase();
    database.$client.exec(`
      INSERT INTO app_state (id, onboarded_at) VALUES (1, 1);
      INSERT INTO library_sources
        (id, path, status, last_scan_outcome, last_scanned_at, last_scan_error_message, created_at, updated_at)
      VALUES
        (1, '/unscanned', 'active', 'unscanned', NULL, NULL, 1, 1),
        (2, '/scanned', 'active', 'ok', 10, NULL, 2, 2),
        (3, '/missing', 'active', 'missing', 10, 'gone', 3, 3),
        (4, '/permission', 'active', 'permission', NULL, 'denied', 4, 4),
        (5, '/failed', 'active', 'failed', NULL, '', 5, 5),
        (6, '/off', 'off', 'failed', 10, 'broken', 6, 6),
        (7, '/forgotten', 'forgotten', 'ok', 10, NULL, 7, 7);
    `);

    const library = readLibrary();

    if (library.kind !== "library") throw new Error("Expected a library snapshot");
    expect(library.sources.map(({ path, status }) => ({ path, status }))).toStrictEqual([
      { path: "/unscanned", status: { kind: "unscanned" } },
      { path: "/scanned", status: { kind: "scanned", scannedAt: 10, trackCount: 0 } },
      { path: "/missing", status: { errorMessage: "gone", kind: "missing", lastScannedAt: 10 } },
      {
        path: "/permission",
        status: { errorMessage: "denied", kind: "permission", lastScannedAt: null },
      },
      { path: "/failed", status: { errorMessage: "", kind: "failed", lastScannedAt: null } },
      { path: "/off", status: { kind: "off" } },
    ]);
  });

  it("sends a populated library with missing tags left empty, sources, and playlists", async () => {
    await openTestDatabase();
    const folder = await createTemporaryFolder("lume-source-");
    const failingFolder = await createTemporaryFolder("lume-failing-");
    const source = await saveSource(folder);
    const failingSource = await saveSource(failingFolder);

    await scanWith(source.id, [
      scannedTrack(join(folder, "bare.mp3"), {}),
      scannedTrack(join(folder, "tagged.flac"), {
        album: "Album",
        albumArtists: ["Album artist"],
        artists: ["Artist A", "Artist B"],
        artwork: { data: new Uint8Array([1, 2, 3]), id: "art-1", mediaType: "image/png" },
        bitrate: 1_411_200.5,
        bitsPerSample: 24,
        channelCount: 2,
        codec: "FLAC",
        discNumber: 1,
        discTotal: 4,
        duration: 261.5,
        format: "FLAC",
        genres: ["Genre A", "Genre B"],
        lossless: true,
        sampleRate: 96_000,
        title: "tagged",
        trackNumber: 3,
        trackTotal: 12,
        year: 2019,
      }),
    ]);
    await scanWith(failingSource.id, [scannedTrack(join(failingFolder, "gone.ogg"), {})]);
    await failScan(failingSource.id, "Folder is missing");
    disableSource(failingSource.id);

    const bare = trackTitled("bare");
    const gone = trackTitled("gone");
    const tagged = trackTitled("tagged");
    setTracksLiked({ liked: true, trackIds: [tagged.id] });

    const playlist = createPlaylist({
      description: null,
      title: "Mix",
      trackIds: [bare.id, tagged.id],
    });

    const empty = createPlaylist({ description: "Notes", title: "Empty", trackIds: [] });

    const library = readLibrary();

    if (library.kind !== "library") throw new Error("Expected a populated library");
    expect(
      library.tracks.map((track) => ({
        album: track.album,
        albumArtists: track.albumArtists,
        artists: track.artists,
        artworkUrl: track.artworkUrl,
        available: track.available,
        likedAt: track.likedAt,
        title: track.title,
        url: track.url,
      })),
    ).toStrictEqual([
      {
        album: null,
        albumArtists: [],
        artists: [],
        artworkUrl: null,
        available: true,
        likedAt: null,
        title: "bare",
        url: `lume://app/media/${bare.id}`,
      },
      {
        album: null,
        albumArtists: [],
        artists: [],
        artworkUrl: null,
        available: false,
        likedAt: null,
        title: "gone",
        url: `lume://app/media/${gone.id}`,
      },
      {
        album: "Album",
        albumArtists: ["Album artist"],
        artists: ["Artist A", "Artist B"],
        artworkUrl: "lume://app/artwork/art-1",
        available: true,
        likedAt: expect.any(Number),
        title: "tagged",
        url: `lume://app/media/${tagged.id}`,
      },
    ]);
    expect(library.sources).toStrictEqual([
      {
        id: source.id,
        path: source.path,
        status: { kind: "scanned", scannedAt: expect.any(Number), trackCount: 2 },
      },
      { id: failingSource.id, path: failingSource.path, status: { kind: "off" } },
    ]);
    expect(library.playlists).toStrictEqual([
      { description: null, id: playlist.id, title: "Mix", trackCount: 2 },
      { description: "Notes", id: empty.id, title: "Empty", trackCount: 0 },
    ]);
  });
});

function trackTitled(title: string) {
  const track = libraryTracks().find((entry) => entry.title === title);

  if (!track) throw new Error(`Expected a track titled ${title}`);

  return track;
}

function scannedTrack(
  path: string,
  metadata: Partial<Extract<ScannedTrack, { kind: "changed" }>>,
): ScannedTrack {
  return {
    album: null,
    albumArtists: [],
    artists: [],
    artwork: null,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: null,
    fileSize: 1,
    format: "MP3",
    genres: [],
    lossless: null,
    sampleRate: null,
    title: path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf(".")),
    trackNumber: null,
    trackTotal: null,
    year: null,
    ...metadata,
    kind: "changed",
    modifiedAt: 1,
    path,
  };
}
