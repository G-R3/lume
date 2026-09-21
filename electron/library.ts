import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import {
  and,
  count,
  eq,
  getColumns,
  isNotNull,
  isNull,
  notExists,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  type LibrarySnapshot,
  type TrackLikeInput,
  getArtworkUrl,
  getTrackUrl,
} from "../shared/lib";
import { getDatabase, runImmediateTransaction, type LibraryDatabase } from "./database";
import { artwork, librarySources, tracks, trackState } from "./database/schema";
import { scanAudioFiles, trackMetadataVersion, type ScannedTrack } from "./library-files";
import { getPlaylists } from "./playlists";

type SourceWriter = Pick<LibraryDatabase, "update">;

const scanVersions = new WeakMap<LibraryDatabase, Map<number, number>>();

const {
  createdAt: _createdAt,
  fileSize: _fileSize,
  metadataVersion: _metadataVersion,
  modifiedAt: _modifiedAt,
  sourceId: _sourceId,
  updatedAt: _updatedAt,
  ...trackColumns
} = getColumns(tracks);

export function getLibrarySnapshot() {
  const sources = getSources();
  const storedTracks = getTracks();

  if (sources.length === 0 && !hasForgottenSources()) {
    return { kind: "first-run" } satisfies LibrarySnapshot;
  }

  return {
    kind: "library",
    playlists: getPlaylists(),
    sources,
    tracks: storedTracks.map((track) => {
      const artists = track.artists.length > 0 ? track.artists : ["Unknown artist"];

      return {
        album: track.album ?? "Unknown album",
        albumArtists: track.albumArtists.length > 0 ? track.albumArtists : artists,
        artists,
        artworkUrl: track.artworkId ? getArtworkUrl(track.artworkId) : null,
        available: track.available,
        bitrate: track.bitrate,
        bitsPerSample: track.bitsPerSample,
        channelCount: track.channelCount,
        codec: track.codec,
        discNumber: track.discNumber,
        discTotal: track.discTotal,
        duration: track.duration,
        format: track.format,
        genres: track.genres,
        id: track.id,
        likedAt: track.likedAt,
        lossless: track.lossless,
        title: track.title,
        sampleRate: track.sampleRate,
        trackNumber: track.trackNumber,
        trackTotal: track.trackTotal,
        url: getTrackUrl(track.id),
        year: track.year,
      };
    }),
  } satisfies LibrarySnapshot;
}

export function setTrackLiked(input: TrackLikeInput) {
  return runImmediateTransaction(getDatabase(), (transaction) => {
    const track = transaction
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.id, input.trackId))
      .get();

    if (!track) throw new Error(`Track was not found: ${input.trackId}`);

    const state = transaction
      .select({ trackId: trackState.trackId })
      .from(trackState)
      .where(eq(trackState.trackId, input.trackId))
      .get();

    const likedAt = input.liked ? Date.now() : null;

    if (!state) {
      if (likedAt === null) return { likedAt, trackId: input.trackId };

      transaction.insert(trackState).values({ likedAt, trackId: input.trackId }).run();

      return { likedAt, trackId: input.trackId };
    }

    transaction
      .update(trackState)
      .set({ likedAt })
      .where(eq(trackState.trackId, input.trackId))
      .run();

    return { likedAt, trackId: input.trackId };
  });
}

export function getSources() {
  return selectSources(isNull(librarySources.forgottenAt)).orderBy(librarySources.createdAt).all();
}

export function getEnabledSources() {
  return selectSources(and(eq(librarySources.enabled, true), isNull(librarySources.forgottenAt)))
    .orderBy(librarySources.createdAt)
    .all();
}

export function getSource(sourceId: number) {
  const source = selectSources(
    and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)),
  ).get();

  if (source) return source;
  throw new Error(`Library source ${sourceId} does not exist`);
}

export function getEnabledSource(sourceId: number) {
  return (
    selectSources(
      and(
        eq(librarySources.id, sourceId),
        eq(librarySources.enabled, true),
        isNull(librarySources.forgottenAt),
      ),
    ).get() ?? null
  );
}

function selectSources(condition: SQL | undefined) {
  return getDatabase()
    .select({
      enabled: librarySources.enabled,
      id: librarySources.id,
      lastScanError: librarySources.lastScanError,
      lastScannedAt: librarySources.lastScannedAt,
      path: librarySources.path,
      trackCount: count(tracks.id),
    })
    .from(librarySources)
    .leftJoin(tracks, and(eq(tracks.sourceId, librarySources.id), eq(tracks.available, true)))
    .where(condition)
    .groupBy(librarySources.id);
}

export function hasForgottenSources() {
  return (
    getDatabase()
      .select({ id: librarySources.id })
      .from(librarySources)
      .where(isNotNull(librarySources.forgottenAt))
      .get() !== undefined
  );
}

export async function saveSource(selectedPath: string) {
  const database = getDatabase();
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  const existing = database
    .select({ id: librarySources.id })
    .from(librarySources)
    .where(eq(librarySources.path, path))
    .get();

  if (existing) {
    rejectSourceOverlap(database, path, existing.id);
    const now = Date.now();

    database
      .update(librarySources)
      .set({
        enabled: true,
        forgottenAt: null,
        updatedAt: sql`CASE
          WHEN ${librarySources.enabled} = 0 OR ${librarySources.forgottenAt} IS NOT NULL THEN ${now}
          ELSE ${librarySources.updatedAt}
        END`,
      })
      .where(eq(librarySources.id, existing.id))
      .run();

    return { id: existing.id, path };
  }

  rejectSourceOverlap(database, path);

  const now = Date.now();

  const source = database
    .insert(librarySources)
    .values({
      createdAt: now,
      enabled: true,
      path,
      updatedAt: now,
    })
    .returning({ id: librarySources.id })
    .get();

  return { id: source.id, path };
}

export function enableSource(sourceId: number) {
  const now = Date.now();

  const source = getDatabase()
    .update(librarySources)
    .set({
      enabled: true,
      updatedAt: sql`CASE
        WHEN ${librarySources.enabled} = 0 THEN ${now}
        ELSE ${librarySources.updatedAt}
      END`,
    })
    .where(and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)))
    .returning({ id: librarySources.id })
    .get();

  if (!source) throw new Error(`Library source ${sourceId} is not active`);
}

export function disableSource(sourceId: number) {
  const now = Date.now();

  runImmediateTransaction(getDatabase(), (transaction) => {
    const source = transaction
      .update(librarySources)
      .set({
        enabled: false,
        updatedAt: sql`CASE
            WHEN ${librarySources.enabled} = 1 THEN ${now}
            ELSE ${librarySources.updatedAt}
          END`,
      })
      .where(and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)))
      .returning({ id: librarySources.id })
      .get();

    if (!source) throw new Error(`Library source ${sourceId} is not active`);

    markSourceTracksUnavailable(transaction, sourceId, now);
  });
}

export function forgetSource(sourceId: number) {
  const now = Date.now();

  runImmediateTransaction(getDatabase(), (transaction) => {
    const source = transaction
      .update(librarySources)
      .set({
        enabled: false,
        forgottenAt: sql`COALESCE(${librarySources.forgottenAt}, ${now})`,
        updatedAt: sql`CASE
            WHEN ${librarySources.enabled} = 1 OR ${librarySources.forgottenAt} IS NULL THEN ${now}
            ELSE ${librarySources.updatedAt}
          END`,
      })
      .where(eq(librarySources.id, sourceId))
      .returning({ id: librarySources.id })
      .get();

    if (!source) throw new Error(`Library source ${sourceId} does not exist`);

    markSourceTracksUnavailable(transaction, sourceId, now);
  });
}

export async function scanEnabledSources(scanFiles = scanAudioFiles) {
  for (const source of getEnabledSources()) {
    await scanSource(source.id, scanFiles);
  }
}

// The scanner parameter lets tests pause overlapping scans without mocking Node's filesystem APIs.
export async function scanSource(sourceId: number, scanFiles = scanAudioFiles) {
  const source = getEnabledSource(sourceId);

  if (!source) return;

  const database = getDatabase();
  const versions = scanVersions.get(database) ?? new Map<number, number>();
  scanVersions.set(database, versions);
  const version = (versions.get(sourceId) ?? 0) + 1;
  versions.set(sourceId, version);
  let scannedTracks: ScannedTrack[];

  try {
    scannedTracks = await scanFiles(source.path, getTrackMetadata(sourceId));
  } catch (error) {
    if (versions.get(sourceId) !== version) return;

    console.warn("Could not read library source", { error, sourceId });
    applyScanFailure(sourceId, error instanceof Error ? getScanErrorMessage(error) : String(error));

    return;
  }

  if (versions.get(sourceId) !== version) return;
  applySourceScan(sourceId, scannedTracks);
}

export function applyScanFailure(sourceId: number, error: string) {
  const database = getDatabase();

  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  runImmediateTransaction(database, (transaction) => {
    markSourceTracksUnavailable(transaction, sourceId, now);
    transaction
      .update(librarySources)
      .set({ lastScanError: error, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();
  });

  return true;
}

export function getTracks() {
  return getDatabase()
    .select({
      ...trackColumns,
      likedAt: trackState.likedAt,
    })
    .from(tracks)
    .leftJoin(trackState, eq(trackState.trackId, tracks.id))
    .orderBy(sql`${tracks.title} COLLATE NOCASE`, tracks.path)
    .all();
}

export function getArtworkData(artworkId: string): ArtworkData | null {
  const storedArtwork = getDatabase()
    .select({ data: artwork.data, mediaType: artwork.mediaType })
    .from(artwork)
    .where(eq(artwork.id, artworkId))
    .get();

  if (!storedArtwork) return null;

  return {
    data: new Uint8Array(storedArtwork.data),
    mediaType: storedArtwork.mediaType,
  };
}

export function getTrackPath(trackId: number) {
  return (
    getDatabase().select({ path: tracks.path }).from(tracks).where(eq(tracks.id, trackId)).get()
      ?.path ?? null
  );
}

export function getTrackMetadata(sourceId: number) {
  return new Map(
    getDatabase()
      .select({
        fileSize: tracks.fileSize,
        modifiedAt: tracks.modifiedAt,
        path: tracks.path,
      })
      .from(tracks)
      .where(and(eq(tracks.sourceId, sourceId), eq(tracks.metadataVersion, trackMetadataVersion)))
      .all()
      .map(
        (track) =>
          [track.path, { fileSize: track.fileSize, modifiedAt: track.modifiedAt }] as const,
      ),
  );
}

export function applySourceScan(sourceId: number, scannedTracks: readonly ScannedTrack[]) {
  const database = getDatabase();

  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  runImmediateTransaction(database, (transaction) => {
    markSourceTracksUnavailable(transaction, sourceId, now);

    const restoreTrack = transaction
      .update(tracks)
      .set({ available: true, updatedAt: sql.placeholder("updatedAt") })
      .where(and(eq(tracks.sourceId, sourceId), eq(tracks.path, sql.placeholder("path"))))
      .prepare();

    const saveArtwork = transaction
      .insert(artwork)
      .values({
        data: sql.placeholder("data"),
        id: sql.placeholder("id"),
        mediaType: sql.placeholder("mediaType"),
      })
      .onConflictDoNothing({ target: artwork.id })
      .prepare();

    const saveTrack = transaction
      .insert(tracks)
      .values({
        album: sql.placeholder("album"),
        albumArtists: sql.placeholder("albumArtists"),
        artists: sql.placeholder("artists"),
        artworkId: sql.placeholder("artworkId"),
        available: true,
        bitrate: sql.placeholder("bitrate"),
        bitsPerSample: sql.placeholder("bitsPerSample"),
        channelCount: sql.placeholder("channelCount"),
        codec: sql.placeholder("codec"),
        createdAt: now,
        discNumber: sql.placeholder("discNumber"),
        discTotal: sql.placeholder("discTotal"),
        duration: sql.placeholder("duration"),
        fileSize: sql.placeholder("fileSize"),
        format: sql.placeholder("format"),
        genres: sql.placeholder("genres"),
        lossless: sql.placeholder("lossless"),
        metadataVersion: trackMetadataVersion,
        modifiedAt: sql.placeholder("modifiedAt"),
        path: sql.placeholder("path"),
        sampleRate: sql.placeholder("sampleRate"),
        sourceId,
        title: sql.placeholder("title"),
        trackNumber: sql.placeholder("trackNumber"),
        trackTotal: sql.placeholder("trackTotal"),
        updatedAt: now,
        year: sql.placeholder("year"),
      })
      .onConflictDoUpdate({
        target: tracks.path,
        set: {
          album: sql`excluded.album`,
          albumArtists: sql`excluded.album_artists`,
          artists: sql`excluded.artists`,
          artworkId: sql`excluded.artwork_id`,
          available: true,
          bitrate: sql`excluded.bitrate`,
          bitsPerSample: sql`excluded.bits_per_sample`,
          channelCount: sql`excluded.channel_count`,
          codec: sql`excluded.codec`,
          discNumber: sql`excluded.disc_number`,
          discTotal: sql`excluded.disc_total`,
          duration: sql`excluded.duration`,
          fileSize: sql`excluded.file_size`,
          format: sql`excluded.format`,
          genres: sql`excluded.genres`,
          lossless: sql`excluded.lossless`,
          metadataVersion: sql`excluded.metadata_version`,
          modifiedAt: sql`excluded.modified_at`,
          sampleRate: sql`excluded.sample_rate`,
          sourceId: sql`excluded.source_id`,
          title: sql`excluded.title`,
          trackNumber: sql`excluded.track_number`,
          trackTotal: sql`excluded.track_total`,
          updatedAt: sql`excluded.updated_at`,
          year: sql`excluded.year`,
        },
      })
      .prepare();

    scannedTracks.forEach((track) => {
      if (track.kind === "unchanged") {
        restoreTrack.run({ path: track.path, updatedAt: now });

        return;
      }

      if (track.artwork) saveArtwork.run(track.artwork);

      saveTrack.run({
        ...track,
        artworkId: track.artwork?.id ?? null,
      });
    });

    transaction
      .delete(artwork)
      .where(
        notExists(
          transaction
            .select({ id: tracks.id })
            .from(tracks)
            .where(eq(tracks.artworkId, artwork.id)),
        ),
      )
      .run();

    transaction
      .update(librarySources)
      .set({ lastScanError: null, lastScannedAt: now, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();
  });

  return true;
}

function isSourceScannable(database: LibraryDatabase, sourceId: number) {
  return (
    database
      .select({ id: librarySources.id })
      .from(librarySources)
      .where(
        and(
          eq(librarySources.id, sourceId),
          eq(librarySources.enabled, true),
          isNull(librarySources.forgottenAt),
        ),
      )
      .get() !== undefined
  );
}

function getScanErrorMessage(error: Error) {
  if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) {
    return "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";
  }

  return error.message;
}

function markSourceTracksUnavailable(database: SourceWriter, sourceId: number, now: number) {
  database
    .update(tracks)
    .set({ available: false, updatedAt: now })
    .where(and(eq(tracks.sourceId, sourceId), eq(tracks.available, true)))
    .run();
}

function rejectSourceOverlap(database: LibraryDatabase, path: string, sourceId?: number) {
  const overlappingPath = database
    .select({ id: librarySources.id, path: librarySources.path })
    .from(librarySources)
    .where(isNull(librarySources.forgottenAt))
    .all()
    .find((source) => source.id !== sourceId && pathsOverlap(source.path, path));

  if (overlappingPath) {
    throw new Error(`This folder overlaps the existing source ${overlappingPath.path}`);
  }
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string) {
  const difference = relative(parent, child);

  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

export type ArtworkData = {
  data: Uint8Array;
  mediaType: string;
};
