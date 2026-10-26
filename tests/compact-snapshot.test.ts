import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { failScan, libraryTracks, scanWith } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import {
  disableSource,
  getLibrarySnapshot,
  getLibrarySnapshotJson,
  saveSource,
  setTrackLiked,
} from "../electron/library";
import type { ScannedTrack } from "../electron/library-files";
import { addTrackToPlaylist, createPlaylist } from "../electron/playlists";
import { compactTrackKeys, parseLibrarySnapshot } from "../shared/lib";

describe("compact library transport", () => {
  it.each([
    ["an unknown kind", { kind: "other" }],
    ["other track keys", libraryWithTrackKeys(compactTrackKeys.slice(1))],
    ["no track keys", libraryWithTrackKeys(undefined)],
  ])("refuses text with %s", (_name, library) => {
    expect(() => parseLibrarySnapshot(JSON.stringify(library))).toThrow(
      /Unsupported library snapshot/,
    );
  });
});

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

    expect(decoded).toStrictEqual(getLibrarySnapshot());
    expect(decoded.kind === "library" && decoded.tracks).toStrictEqual([
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

  it("sends a populated library the way the object path builds it", async () => {
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
    const tagged = trackTitled("tagged");
    setTrackLiked({ liked: true, trackId: tagged.id });
    const playlist = createPlaylist({ description: null, title: "Mix" });
    createPlaylist({ description: "Notes", title: "Empty" });
    addTrackToPlaylist({ playlistId: playlist.id, trackId: bare.id });
    addTrackToPlaylist({ playlistId: playlist.id, trackId: tagged.id });

    const library = getLibrarySnapshot();

    if (library.kind !== "library") throw new Error("Expected a populated library");
    expect(
      library.tracks.map((track) => [track.title, track.artworkUrl, track.likedAt === null]),
    ).toEqual([
      ["bare", null, true],
      ["gone", null, true],
      ["tagged", expect.stringContaining("art-1"), false],
    ]);
    expect(library.tracks.map((track) => track.available)).toEqual([true, false, true]);
    expect(library.sources.map((entry) => [entry.enabled, entry.lastScanError])).toEqual([
      [true, null],
      [false, "Folder is missing"],
    ]);
    expect(
      library.playlists.map((entry) => [entry.title, entry.description, entry.trackCount]),
    ).toEqual([
      ["Mix", null, 2],
      ["Empty", "Notes", 0],
    ]);

    expect(parseLibrarySnapshot(getLibrarySnapshotJson())).toStrictEqual(library);
  });
});

function libraryWithTrackKeys(trackKeys: readonly string[] | undefined) {
  return { kind: "library", playlists: [], sources: [], trackKeys, tracks: [] };
}

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
