import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { and, count, eq, inArray, isNotNull, isNull, notExists, sql, type SQL } from "drizzle-orm";
import {
  type LibraryUpdate,
  type SetTracksLikedInput,
  type TracksLikedResult,
  type TrackTuple,
  type TrackTupleKey,
  albumArtistsIfDifferent,
  trackTupleKeys,
  getArtworkUrl,
  stringifyLibrary,
  stringifyFirstRunLibrary,
} from "../shared/lib";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  getDatabase,
  parameterChunks,
  runImmediateTransaction,
  type LibraryDatabase,
} from "./database";
import { artwork, librarySources, tracks, trackState } from "./database/schema";
import {
  describeFolderReadError,
  scanAudioFiles,
  trackMetadataVersion,
  type ScannedTrack,
} from "./library-files";
import { getPlaylists, requireTracks } from "./playlists";

type SourceWriter = Pick<LibraryDatabase, "update">;

type ScanFiles = typeof scanAudioFiles;

type SourceScanStop = "superseded" | "disabled";

export type SourceScanOutcome =
  | { kind: "committed"; tracksChanged: boolean }
  | { kind: "dropped"; reason: "not-enabled" | SourceScanStop };

export type LibraryScanOutcome = "no-enabled-sources" | "tracks-changed" | "tracks-unchanged";

// A scan may commit only while it is still its source's entry here. A newer scan replaces it,
// and disabling or forgetting the source removes it, so a read from an earlier enabled lifetime never commits.
type SourceScan = { controller: AbortController; stoppedBy: SourceScanStop | null };

let libraryRevision = 0;

function nextLibraryRevision() {
  libraryRevision += 1;

  return libraryRevision;
}

const runningScans = new WeakMap<LibraryDatabase, Map<number, SourceScan>>();

function runningScansOf(database: LibraryDatabase) {
  const scans = runningScans.get(database) ?? new Map<number, SourceScan>();
  runningScans.set(database, scans);

  return scans;
}

function startSourceScan(database: LibraryDatabase, sourceId: number) {
  stopSourceScan(database, sourceId, "superseded");

  const scan: SourceScan = { controller: new AbortController(), stoppedBy: null };
  runningScansOf(database).set(sourceId, scan);

  return scan;
}

function stopSourceScan(database: LibraryDatabase, sourceId: number, reason: SourceScanStop) {
  const scans = runningScansOf(database);
  const scan = scans.get(sourceId);

  if (!scan) return;

  scans.delete(sourceId);
  scan.stoppedBy = reason;
  scan.controller.abort(reason);
}

function finishSourceScan(database: LibraryDatabase, sourceId: number, scan: SourceScan) {
  const scans = runningScansOf(database);

  if (scans.get(sourceId) === scan) scans.delete(sourceId);
}

function displayAlbumArtists(albumArtists: string[], artists: string[]) {
  return albumArtists.length > 0 ? albumArtists : artists;
}

const storedTrackColumns = {
  addedAt: tracks.createdAt,
  album: tracks.album,
  albumArtists: tracks.albumArtists,
  artists: tracks.artists,
  artworkUrl: tracks.artworkId,
  available: tracks.available,
  bitrate: tracks.bitrate,
  bitsPerSample: tracks.bitsPerSample,
  channelCount: tracks.channelCount,
  codec: tracks.codec,
  discNumber: tracks.discNumber,
  discTotal: tracks.discTotal,
  duration: tracks.duration,
  format: tracks.format,
  genres: tracks.genres,
  id: tracks.id,
  likedAt: trackState.likedAt,
  lossless: tracks.lossless,
  title: tracks.title,
  sampleRate: tracks.sampleRate,
  trackNumber: tracks.trackNumber,
  trackTotal: tracks.trackTotal,
  year: tracks.year,
} satisfies Record<TrackTupleKey, SQLiteColumn>;

const trackTupleColumns = Object.fromEntries(
  trackTupleKeys.map((key) => [key, storedTrackColumns[key]]),
);

type StoredValue<Column extends SQLiteColumn> =
  | Column["_"]["driverParam"]
  | (Column["_"]["notNull"] extends true ? never : null);

type StoredValues<Keys extends readonly TrackTupleKey[]> = {
  -readonly [Index in keyof Keys]: StoredValue<(typeof storedTrackColumns)[Keys[Index]]>;
};

type StoredTrackRow = StoredValues<typeof trackTupleKeys>;

// Returns the library as JSON, with each track as a tuple ([addedAt, album, ...]) instead of an object
// tuples don't repeat the field names for every track, so the string is smaller and faster to send
export function getLibrarySnapshotJson() {
  const sources = getSources();

  if (sources.length === 0 && !hasForgottenSources()) {
    return stringifyFirstRunLibrary(nextLibraryRevision());
  }

  // SAFETY: Drizzle returns `.values()` rows untyped.
  // Each row holds the raw SQLite values of `trackTupleColumns`, in that order.
  // tests/library-json.test.ts checks every position.
  const rows = getDatabase()
    .select(trackTupleColumns)
    .from(tracks)
    .leftJoin(trackState, eq(trackState.trackId, tracks.id))
    .orderBy(sql`${tracks.title} COLLATE NOCASE`, tracks.path)
    .values() as StoredTrackRow[];

  return stringifyLibrary(
    nextLibraryRevision(),
    getPlaylists(),
    sources,
    rows.map(trackTupleFromRow),
  );
}

function trackTupleFromRow(row: StoredTrackRow): TrackTuple {
  const [
    addedAt,
    album,
    storedAlbumArtists,
    storedArtists,
    artworkId,
    available,
    bitrate,
    bitsPerSample,
    channelCount,
    codec,
    discNumber,
    discTotal,
    duration,
    format,
    genres,
    id,
    likedAt,
    lossless,
    title,
    sampleRate,
    trackNumber,
    trackTotal,
    year,
  ] = row;

  const artists = tracks.artists.mapFromDriverValue(storedArtists);

  const albumArtists = displayAlbumArtists(
    tracks.albumArtists.mapFromDriverValue(storedAlbumArtists),
    artists,
  );

  return [
    addedAt,
    album,
    albumArtistsIfDifferent(albumArtists, artists),
    artists,
    artworkId ? getArtworkUrl(artworkId) : null,
    tracks.available.mapFromDriverValue(available),
    bitrate,
    bitsPerSample,
    channelCount,
    codec,
    discNumber,
    discTotal,
    duration,
    format,
    tracks.genres.mapFromDriverValue(genres),
    id,
    likedAt,
    lossless === null ? null : tracks.lossless.mapFromDriverValue(lossless),
    title,
    sampleRate,
    trackNumber,
    trackTotal,
    year,
  ];
}

export function setTracksLiked(input: SetTracksLikedInput): TracksLikedResult {
  const trackIds = [...new Set(input.trackIds)];

  return runImmediateTransaction(getDatabase(), (transaction) => {
    requireTracks(transaction, trackIds);

    const likedAt = input.liked ? Date.now() : null;

    if (likedAt === null) {
      for (const ids of parameterChunks(trackIds)) {
        transaction
          .update(trackState)
          .set({ likedAt })
          .where(inArray(trackState.trackId, ids))
          .run();
      }
    } else {
      for (const ids of parameterChunks(trackIds, 2)) {
        transaction
          .insert(trackState)
          .values(ids.map((trackId) => ({ likedAt, trackId })))
          .onConflictDoUpdate({ set: { likedAt }, target: trackState.trackId })
          .run();
      }
    }

    return {
      likes: trackIds.map((trackId) => ({ likedAt, trackId })),
      revision: nextLibraryRevision(),
    };
  });
}

export function getSources() {
  return selectSources(isNull(librarySources.forgottenAt)).orderBy(librarySources.createdAt).all();
}

function getEnabledSources() {
  return selectSources(enabledSource()).orderBy(librarySources.createdAt).all();
}

function enabledSource() {
  return and(eq(librarySources.enabled, true), isNull(librarySources.forgottenAt));
}

function getEnabledSourcePath(database: LibraryDatabase, sourceId: number) {
  return (
    database
      .select({ path: librarySources.path })
      .from(librarySources)
      .where(and(eq(librarySources.id, sourceId), enabledSource()))
      .get()?.path ?? null
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

function hasForgottenSources() {
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
  const database = getDatabase();
  const now = Date.now();

  runImmediateTransaction(database, (transaction) => {
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

  stopSourceScan(database, sourceId, "disabled");
}

export function forgetSource(sourceId: number) {
  const database = getDatabase();
  const now = Date.now();

  runImmediateTransaction(database, (transaction) => {
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

  stopSourceScan(database, sourceId, "disabled");
}

export async function scanEnabledSources(
  scanFiles: ScanFiles = scanAudioFiles,
): Promise<LibraryScanOutcome> {
  const sources = getEnabledSources();

  if (sources.length === 0) return "no-enabled-sources";

  let tracksChanged = false;

  for (const source of sources) {
    const outcome = await scanSource(source.id, scanFiles);

    if (outcome.kind === "committed" && outcome.tracksChanged) tracksChanged = true;
  }

  return tracksChanged ? "tracks-changed" : "tracks-unchanged";
}

// A dropped scan wrote nothing, and whatever dropped it replied with its own snapshot,
// so only committed track changes need a full snapshot here.
export function getLibraryUpdate(outcome: LibraryScanOutcome | "failed"): LibraryUpdate | null {
  if (outcome === "no-enabled-sources") return null;

  if (outcome === "tracks-unchanged") {
    return { kind: "sources", revision: nextLibraryRevision(), sources: getSources() };
  }

  return { kind: "snapshot", library: getLibrarySnapshotJson() };
}

export async function scanSource(
  sourceId: number,
  scanFiles: ScanFiles = scanAudioFiles,
): Promise<SourceScanOutcome> {
  const database = getDatabase();
  const sourcePath = getEnabledSourcePath(database, sourceId);

  if (sourcePath === null) return { kind: "dropped", reason: "not-enabled" };

  const scan = startSourceScan(database, sourceId);

  try {
    let scannedTracks: ScannedTrack[];

    try {
      scannedTracks = await scanFiles(
        sourcePath,
        getStoredTrackFingerprints(database, sourceId),
        scan.controller.signal,
      );
    } catch (error) {
      if (scan.stoppedBy) return { kind: "dropped", reason: scan.stoppedBy };

      console.warn("Could not read library source", { error, sourceId });
      const message = error instanceof Error ? describeFolderReadError(error) : String(error);

      return { kind: "committed", tracksChanged: commitScanFailure(database, sourceId, message) };
    }

    if (scan.stoppedBy) return { kind: "dropped", reason: scan.stoppedBy };

    return {
      kind: "committed",
      tracksChanged: commitSourceScan(database, sourceId, scannedTracks),
    };
  } finally {
    finishSourceScan(database, sourceId, scan);
  }
}

function commitScanFailure(database: LibraryDatabase, sourceId: number, error: string) {
  const now = Date.now();

  return runImmediateTransaction(database, (transaction) => {
    transaction
      .update(librarySources)
      .set({ lastScanError: error, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();

    return markSourceTracksUnavailable(transaction, sourceId, now);
  });
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

export async function hasTrackFile(trackId: number) {
  const path = getTrackPath(trackId);

  return (
    path !== null &&
    (await stat(path).then(
      (file) => file.isFile(),
      () => false,
    ))
  );
}

function getStoredTrackFingerprints(database: LibraryDatabase, sourceId: number) {
  return new Map(
    database
      .select({
        fileSize: tracks.fileSize,
        metadataVersion: tracks.metadataVersion,
        modifiedAt: tracks.modifiedAt,
        path: tracks.path,
      })
      .from(tracks)
      .where(eq(tracks.sourceId, sourceId))
      .all()
      .map(
        (track) =>
          [
            track.path,
            {
              fileSize: track.fileSize,
              metadataVersion: track.metadataVersion,
              modifiedAt: track.modifiedAt,
            },
          ] as const,
      ),
  );
}

function commitSourceScan(
  database: LibraryDatabase,
  sourceId: number,
  scannedTracks: readonly ScannedTrack[],
) {
  const now = Date.now();

  return runImmediateTransaction(database, (transaction) => {
    const unseenTracks = new Map(
      transaction
        .select({ available: tracks.available, id: tracks.id, path: tracks.path })
        .from(tracks)
        .where(eq(tracks.sourceId, sourceId))
        .all()
        .map((track) => [track.path, track] as const),
    );

    const restoreTrack = transaction
      .update(tracks)
      .set({ available: true, updatedAt: now })
      .where(eq(tracks.id, sql.placeholder("id")))
      .prepare();

    const markTrackUnavailable = transaction
      .update(tracks)
      .set({ available: false, updatedAt: now })
      .where(eq(tracks.id, sql.placeholder("id")))
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

    let savedTracks = false;
    let tracksChanged = false;

    scannedTracks.forEach((track) => {
      const storedTrack = unseenTracks.get(track.path);
      unseenTracks.delete(track.path);

      if (track.kind === "unchanged") {
        if (storedTrack && !storedTrack.available) {
          restoreTrack.run({ id: storedTrack.id });
          tracksChanged = true;
        }

        return;
      }

      if (track.artwork) saveArtwork.run(track.artwork);

      saveTrack.run({
        ...track,
        artworkId: track.artwork?.id ?? null,
      });
      savedTracks = true;
      tracksChanged = true;
    });

    unseenTracks.forEach((track) => {
      if (!track.available) return;

      markTrackUnavailable.run({ id: track.id });
      tracksChanged = true;
    });

    if (savedTracks) {
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
    }

    transaction
      .update(librarySources)
      .set({ lastScanError: null, lastScannedAt: now, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();

    return tracksChanged;
  });
}

function markSourceTracksUnavailable(database: SourceWriter, sourceId: number, now: number) {
  const { changes } = database
    .update(tracks)
    .set({ available: false, updatedAt: now })
    .where(and(eq(tracks.sourceId, sourceId), eq(tracks.available, true)))
    .run();

  return changes > 0;
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
