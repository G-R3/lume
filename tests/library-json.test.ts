import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { failScan, libraryTracks, readLibrary, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import {
  disableSource,
  getLibrarySnapshotJson,
  saveSource,
  setTrackLiked,
} from "../electron/library";
import type { ScannedTrack } from "../electron/library-files";
import { addTrackToPlaylist, createPlaylist } from "../electron/playlists";
import { parseLibrarySnapshot } from "../shared/lib";

describe("library transport from stored rows", () => {
  it("sends first-run before any source exists", async () => {
    await openTestDatabase();

    expect(parseLibrarySnapshot(getLibrarySnapshotJson())).toStrictEqual({ kind: "first-run" });
  });

  it("sends every stored field in its own position", async () => {
    const database = await openTestDatabase();
    database.$client.exec(`
      INSERT INTO library_sources (id, path, enabled, created_at, updated_at) VALUES (1, '/s', 1, 1, 2);
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
      { enabled: true, id: 1, lastScanError: null, lastScannedAt: null, path: "/s", trackCount: 1 },
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

  it("sends a populated library with display fallbacks, sources, and playlists", async () => {
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
    setTrackLiked({ liked: true, trackId: tagged.id });
    const playlist = createPlaylist({ description: null, title: "Mix" });
    const empty = createPlaylist({ description: "Notes", title: "Empty" });
    addTrackToPlaylist({ playlistId: playlist.id, trackId: bare.id });
    addTrackToPlaylist({ playlistId: playlist.id, trackId: tagged.id });

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
        album: "Unknown album",
        albumArtists: ["Unknown artist"],
        artists: ["Unknown artist"],
        artworkUrl: null,
        available: true,
        likedAt: null,
        title: "bare",
        url: `lume://app/media/${bare.id}`,
      },
      {
        album: "Unknown album",
        albumArtists: ["Unknown artist"],
        artists: ["Unknown artist"],
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
        enabled: true,
        id: source.id,
        lastScanError: null,
        lastScannedAt: expect.any(Number),
        path: source.path,
        trackCount: 2,
      },
      {
        enabled: false,
        id: failingSource.id,
        lastScanError: "Folder is missing",
        lastScannedAt: expect.any(Number),
        path: failingSource.path,
        trackCount: 0,
      },
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
