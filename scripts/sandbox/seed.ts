import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { eq, like, sql } from "drizzle-orm";
import { closeDatabase, getDatabase, initializeDatabase } from "../../electron/database";
import { artwork, tracks } from "../../electron/database/schema";
import { getTracks, saveSource, scanSource, setTrackLiked } from "../../electron/library";
import { addTrackToPlaylist, createPlaylist } from "../../electron/playlists";
import {
  componentStateTracks,
  createArtworkSvg,
  type FixtureTrack,
  fixturePlaylists,
  roughDataTracks,
} from "../../src/states/fixtures";
import { createWaveAudio } from "../../tests/helpers/wave-audio";

const fixtureTracks: readonly FixtureTrack[] = [
  ...roughDataTracks,
  ...Object.values(componentStateTracks),
];

/**
 * Seeds a library in `<profile>/user-data`, the way e2e/electron.smoke.test.ts does: real files are
 * scanned, then the fixture metadata is written over the scanned rows. The files stay unchanged, so
 * the app's startup scan keeps that metadata, marks deleted files unavailable and reports the
 * deleted folder.
 */
export async function seedLibrary(profile: string, bulkCount: number) {
  const userData = join(profile, "user-data");
  const music = join(profile, "music", "Lossless");
  const archive = join(profile, "music", "Archive");
  await mkdir(userData, { recursive: true });
  await mkdir(music, { recursive: true });
  await mkdir(archive, { recursive: true });

  await Promise.all(
    fixtureTracks.map((track) =>
      writeFile(join(music, `${track.fileName}.wav`), createWaveAudio(1, 16)),
    ),
  );
  await writeFile(join(archive, "archived.wav"), createWaveAudio(1, 16));

  if (bulkCount > 0) {
    const bulk = join(music, "bulk");
    await mkdir(bulk);

    for (let index = 1; index <= bulkCount; index += 1) {
      await writeFile(
        join(bulk, `Bulk track ${String(index).padStart(5, "0")}.wav`),
        createWaveAudio(0.01),
      );
    }
  }

  await initializeDatabase({
    location: join(userData, "lume-dev.sqlite"),
    migrationsFolder: join(process.cwd(), "drizzle"),
  });

  try {
    const source = await saveSource(music);
    await scanSource(source.id);
    applyFixtureMetadata();

    const archiveSource = await saveSource(archive);
    await scanSource(archiveSource.id);
  } finally {
    closeDatabase();
  }

  // Deleted after scanning, so the next scan (on app start) finds them missing.
  await Promise.all(
    fixtureTracks.flatMap((track) =>
      track.available ? [] : [rm(join(music, `${track.fileName}.wav`))],
    ),
  );
  await rm(archive, { recursive: true });

  return { music, userData };
}

function applyFixtureMetadata() {
  const database = getDatabase();
  const storedTracks = getTracks();

  const idsByFileName = new Map(
    storedTracks.map((track) => [basename(track.path, ".wav"), track.id] as const),
  );

  for (const fixture of fixtureTracks) {
    const trackId = idsByFileName.get(fixture.fileName);

    if (trackId === undefined) throw new Error(`Fixture was not scanned: ${fixture.fileName}`);

    const artworkId = fixture.artwork ? storeArtwork(createArtworkSvg(fixture.artwork)) : null;

    database
      .update(tracks)
      .set({
        album: fixture.album,
        albumArtists: [...fixture.artists],
        artists: [...fixture.artists],
        artworkId,
        createdAt: Date.parse(fixture.added),
        duration: fixture.duration,
        format: "FLAC",
        title: fixture.title ?? fixture.fileName,
      })
      .where(eq(tracks.id, trackId))
      .run();

    if (fixture.liked) setTrackLiked({ liked: true, trackId });
  }

  // Durations from 2:00 to 8:39, so bulk rows aren't all one second long.
  database
    .update(tracks)
    .set({ duration: sql`120 + (${tracks.id} * 37) % 400` })
    .where(like(tracks.path, "%/bulk/%"))
    .run();

  const [longPlaylist, shortPlaylist] = fixturePlaylists.map((playlist) =>
    createPlaylist({ description: playlist.description, title: playlist.title }),
  );

  const playlistTracks = [
    {
      fileNames: roughDataTracks.slice(0, 6).map((track) => track.fileName),
      playlist: longPlaylist,
    },
    {
      fileNames: Object.values(componentStateTracks).map((track) => track.fileName),
      playlist: shortPlaylist,
    },
  ];

  for (const { fileNames, playlist } of playlistTracks) {
    if (!playlist) continue;

    for (const fileName of fileNames) {
      const trackId = idsByFileName.get(fileName);

      if (trackId !== undefined) addTrackToPlaylist({ playlistId: playlist.id, trackId });
    }
  }
}

function storeArtwork(svg: string) {
  const data = Buffer.from(svg);
  const id = createHash("sha256").update(data).digest("hex");

  getDatabase()
    .insert(artwork)
    .values({ data, id, mediaType: "image/svg+xml" })
    .onConflictDoNothing()
    .run();

  return id;
}
