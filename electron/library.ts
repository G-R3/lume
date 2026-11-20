import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import {
  and,
  count,
  eq,
  getColumns,
  inArray,
  isNull,
  ne,
  notExists,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  type LibrarySource,
  type SetTracksLikedInput,
  type SourceStatus,
  type TracksLikedResult,
} from "@shared/library";
import {
  type TrackTuple,
  type TrackTupleKey,
  albumArtistsIfDifferent,
  trackTuplePositions,
  trackTupleKeys,
  toTrackTuple,
  stringifyLibrary,
  stringifyFirstRunLibrary,
} from "@shared/library-json";
import { getArtworkUrl } from "@shared/app-urls";
import type { SQLiteColumn, SQLiteInsertValue } from "drizzle-orm/sqlite-core";
import {
  getDatabase,
  parameterChunks,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./database";
import { appState, artwork, librarySources, tracks, trackState } from "./database/schema";
import {
  classifyFolderReadError,
  scanAudioFiles,
  trackMetadataVersion,
  type FolderReadFailure,
  type ScannedTrack,
} from "./library-files";
import {
  commitLibrary,
  currentLibraryRevision,
  getLibraryState,
  publishScans,
} from "./library-events";
import { getPlaylists, requireTracks } from "./playlists";
import { sourceGate, trackUnavailableReason, type SourceGate } from "./track-availability";

type ScanFiles = typeof scanAudioFiles;

type SourceScanStop = "superseded" | "disabled";

export type SourceScanOutcome =
  | { kind: "committed" }
  | { kind: "dropped"; reason: "not-enabled" | SourceScanStop };

type SourceScan = { controller: AbortController; stoppedBy: SourceScanStop | null };

const currentScans = new WeakMap<LibraryDatabase, Map<number, SourceScan>>();

function currentScansOf(database: LibraryDatabase) {
  const scans = currentScans.get(database) ?? new Map<number, SourceScan>();
  currentScans.set(database, scans);

  return scans;
}

function startSourceScan(database: LibraryDatabase, sourceId: number) {
  stopSourceScan(database, sourceId, "superseded");

  const scan: SourceScan = { controller: new AbortController(), stoppedBy: null };
  const scans = currentScansOf(database);
  scans.set(sourceId, scan);
  publishScans([...scans.keys()]);

  return scan;
}

function stopSourceScan(database: LibraryDatabase, sourceId: number, reason: SourceScanStop) {
  const scans = currentScansOf(database);
  const scan = scans.get(sourceId);

  if (!scan) return;

  scans.delete(sourceId);
  scan.stoppedBy = reason;
  scan.controller.abort(reason);
  publishScans([...scans.keys()]);
}

function finishSourceScan(database: LibraryDatabase, sourceId: number, scan: SourceScan) {
  const scans = currentScansOf(database);

  if (scans.get(sourceId) !== scan) return;

  scans.delete(sourceId);
  publishScans([...scans.keys()]);
}

function displayAlbumArtists(albumArtists: string[], artists: string[]) {
  return albumArtists.length > 0 ? albumArtists : artists;
}

const trackTupleSourceColumns = {
  addedAt: tracks.createdAt,
  album: tracks.album,
  albumArtists: tracks.albumArtists,
  artists: tracks.artists,
  artworkUrl: tracks.artworkId,
  unavailableReason: tracks.missingSince,
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

const storedTrackRowColumns = {
  ...Object.fromEntries(trackTupleKeys.map((key) => [key, trackTupleSourceColumns[key]])),
  sourceId: tracks.sourceId,
};

type StoredValue<Column extends SQLiteColumn> =
  | Column["_"]["driverParam"]
  | (Column["_"]["notNull"] extends true ? never : null);

type StoredValues<Keys extends readonly TrackTupleKey[]> = {
  -readonly [Index in keyof Keys]: StoredValue<(typeof trackTupleSourceColumns)[Keys[Index]]>;
};

type StoredTrackRow = [
  ...StoredValues<typeof trackTupleKeys>,
  sourceId: StoredValue<typeof tracks.sourceId>,
];

// Returns the library as JSON, with each track as a tuple ([addedAt, album, ...]) instead of an object
// tuples don't repeat the field names for every track, so the string is smaller and faster to send
export function getLibrarySnapshotJson() {
  if (!isOnboarded()) return stringifyFirstRunLibrary(getLibraryState());

  const database = getDatabase();
  const gates = getSourceGates(database);

  // SAFETY: Drizzle returns `.values()` rows untyped.
  // Each row holds the raw SQLite values of `storedTrackRowColumns`, in that order.
  // tests/library-json.test.ts checks every position.
  const rows = database
    .select(storedTrackRowColumns)
    .from(tracks)
    .leftJoin(trackState, eq(trackState.trackId, tracks.id))
    .values() as StoredTrackRow[];

  return stringifyLibrary(
    getLibraryState(),
    getPlaylists(),
    getSources(),
    rows.map((row) => trackTupleFromRow(row, gates)),
  );
}

function getSourceGates(database: LibraryDatabase) {
  return new Map(
    database
      .select({
        id: librarySources.id,
        lastScanOutcome: librarySources.lastScanOutcome,
        status: librarySources.status,
      })
      .from(librarySources)
      .all()
      .map((source) => [source.id, sourceGate(source.status, source.lastScanOutcome)] as const),
  );
}

function trackTupleFromRow(
  row: StoredTrackRow,
  gates: ReadonlyMap<number, SourceGate>,
): TrackTuple {
  const at = trackTuplePositions;
  const sourceId = row[trackTupleKeys.length];
  const gate = gates.get(sourceId);

  if (!gate) throw new Error(`Track ${row[at.id]} belongs to unknown library source ${sourceId}`);

  const artists = tracks.artists.mapFromDriverValue(row[at.artists]);

  const albumArtists = displayAlbumArtists(
    tracks.albumArtists.mapFromDriverValue(row[at.albumArtists]),
    artists,
  );

  const artworkId = row[at.artworkUrl];
  const lossless = row[at.lossless];

  return toTrackTuple({
    addedAt: row[at.addedAt],
    album: row[at.album],
    albumArtists: albumArtistsIfDifferent(albumArtists, artists),
    artists,
    artworkUrl: artworkId ? getArtworkUrl(artworkId) : null,
    unavailableReason: trackUnavailableReason(gate, row[at.unavailableReason]),
    bitrate: row[at.bitrate],
    bitsPerSample: row[at.bitsPerSample],
    channelCount: row[at.channelCount],
    codec: row[at.codec],
    discNumber: row[at.discNumber],
    discTotal: row[at.discTotal],
    duration: row[at.duration],
    format: row[at.format],
    genres: tracks.genres.mapFromDriverValue(row[at.genres]),
    id: row[at.id],
    likedAt: row[at.likedAt],
    lossless: lossless === null ? null : tracks.lossless.mapFromDriverValue(lossless),
    title: row[at.title],
    sampleRate: row[at.sampleRate],
    trackNumber: row[at.trackNumber],
    trackTotal: row[at.trackTotal],
    year: row[at.year],
  });
}

export function setTracksLiked(input: SetTracksLikedInput): TracksLikedResult {
  const trackIds = [...new Set(input.trackIds)];

  const likes = commitLibrary(
    getDatabase(),
    (transaction) => {
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

      return trackIds.map((trackId) => ({ likedAt, trackId }));
    },
    (likes, revision) => ({ kind: "tracks-liked", likes, revision }),
  );

  return { likes, revision: currentLibraryRevision() };
}

const notForgottenSource = ne(librarySources.status, "forgotten");

const enabledSource = eq(librarySources.status, "active");

export function getSources() {
  return selectSources(notForgottenSource).map(sourceFromRow);
}

function getEnabledSources() {
  return selectSources(enabledSource);
}

function getEnabledSourcePath(database: LibraryDatabase, sourceId: number) {
  return (
    database
      .select({ path: librarySources.path })
      .from(librarySources)
      .where(and(eq(librarySources.id, sourceId), enabledSource))
      .get()?.path ?? null
  );
}

function selectSources(condition: SQL) {
  return getDatabase()
    .select({
      id: librarySources.id,
      lastScanErrorMessage: librarySources.lastScanErrorMessage,
      lastScanOutcome: librarySources.lastScanOutcome,
      lastScannedAt: librarySources.lastScannedAt,
      path: librarySources.path,
      status: librarySources.status,
      trackCount: count(tracks.id),
    })
    .from(librarySources)
    .leftJoin(tracks, and(eq(tracks.sourceId, librarySources.id), isNull(tracks.missingSince)))
    .where(condition)
    .groupBy(librarySources.id)
    .orderBy(librarySources.createdAt)
    .all();
}

type SourceRow = ReturnType<typeof selectSources>[number];

function sourceFromRow(row: SourceRow): LibrarySource {
  return { id: row.id, path: row.path, status: sourceStatusFromRow(row) };
}

// The table's CHECKs keep these combinations consistent, but Drizzle types each column alone.
function sourceStatusFromRow(row: SourceRow): SourceStatus {
  if (row.status === "forgotten") throw new Error(`Library source ${row.id} is forgotten`);

  if (row.status === "off") return { kind: "off" };

  switch (row.lastScanOutcome) {
    case "unscanned":
      return { kind: "unscanned" };
    case "ok":
      if (row.lastScannedAt === null) break;

      return { kind: "scanned", scannedAt: row.lastScannedAt, trackCount: row.trackCount };
    case "missing":
    case "permission":
    case "failed":
      if (row.lastScanErrorMessage === null) break;

      return {
        errorMessage: row.lastScanErrorMessage,
        kind: row.lastScanOutcome,
        lastScannedAt: row.lastScannedAt,
      };
  }

  throw new Error(`Library source ${row.id} has an inconsistent scan outcome`);
}

function isOnboarded() {
  return getDatabase().select({ id: appState.id }).from(appState).get() !== undefined;
}

export async function saveSource(selectedPath: string) {
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  return commitLibrary(getDatabase(), (transaction) => {
    rejectSourceOverlap(transaction, path);

    const now = Date.now();

    const source = transaction
      .insert(librarySources)
      .values({ createdAt: now, path, status: "active", updatedAt: now })
      .onConflictDoUpdate({
        target: librarySources.path,
        set: { status: "active", updatedAt: updatedAtUnless("active", now) },
      })
      .returning({ id: librarySources.id })
      .get();

    transaction.insert(appState).values({ id: 1, onboardedAt: now }).onConflictDoNothing().run();

    return { id: source.id, path };
  });
}

export function enableSource(sourceId: number, scanFiles: ScanFiles = scanAudioFiles) {
  setSourceStatus(sourceId, "active");

  return scanSource(sourceId, scanFiles);
}

export function disableSource(sourceId: number) {
  setSourceStatus(sourceId, "off");
  stopSourceScan(getDatabase(), sourceId, "disabled");
}

export function forgetSource(sourceId: number) {
  setSourceStatus(sourceId, "forgotten");
  stopSourceScan(getDatabase(), sourceId, "disabled");
}

function setSourceStatus(sourceId: number, status: SourceRow["status"]) {
  commitLibrary(getDatabase(), (transaction) => {
    const source = transaction
      .update(librarySources)
      .set({ status, updatedAt: updatedAtUnless(status, Date.now()) })
      .where(
        status === "forgotten"
          ? eq(librarySources.id, sourceId)
          : and(eq(librarySources.id, sourceId), notForgottenSource),
      )
      .returning({ id: librarySources.id })
      .get();

    if (!source) throw new Error(`Library source ${sourceId} does not exist`);
  });
}

export function scanEnabledSources(scanFiles: ScanFiles = scanAudioFiles) {
  return Promise.all(getEnabledSources().map((source) => scanSource(source.id, scanFiles)));
}

export function scanInBackground(scan: Promise<unknown>) {
  scan.catch((error) => console.error("Could not scan the music library", error));
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
      scannedTracks = await Promise.race([
        scanFiles(
          sourcePath,
          getStoredTrackFingerprints(database, sourceId),
          scan.controller.signal,
        ),
        rejectWhenStopped(scan.controller.signal),
      ]);
    } catch (error) {
      if (scan.stoppedBy) return { kind: "dropped", reason: scan.stoppedBy };

      console.warn("Could not read library source", { error, sourceId });

      const failure = classifyFolderReadError(
        error instanceof Error ? error : new Error(String(error)),
      );

      commitScanFailure(database, sourceId, failure);

      return { kind: "committed" };
    }

    if (scan.stoppedBy) return { kind: "dropped", reason: scan.stoppedBy };

    try {
      commitSourceScan(database, sourceId, scannedTracks);
    } catch (error) {
      console.error("Could not save a library scan", { error, sourceId });
      commitScanFailure(database, sourceId, {
        errorMessage: error instanceof Error ? error.message : String(error),
        kind: "failed",
      });
    }

    return { kind: "committed" };
  } finally {
    finishSourceScan(database, sourceId, scan);
  }
}

// Metadata reads already in progress can't be cancelled, so a stopped scan stops waiting for them.
function rejectWhenStopped(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function commitScanFailure(
  database: LibraryDatabase,
  sourceId: number,
  failure: FolderReadFailure,
) {
  commitLibrary(database, (transaction) => {
    transaction
      .update(librarySources)
      .set({
        lastScanErrorMessage: failure.errorMessage,
        lastScanOutcome: failure.kind,
        updatedAt: Date.now(),
      })
      .where(eq(librarySources.id, sourceId))
      .run();
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

  commitLibrary(database, (transaction) => {
    const unseenTracks = new Map(
      transaction
        .select({ id: tracks.id, missingSince: tracks.missingSince, path: tracks.path })
        .from(tracks)
        .where(eq(tracks.sourceId, sourceId))
        .all()
        .map((track) => [track.path, track] as const),
    );

    const setMissingSince = transaction
      .update(tracks)
      .set({ missingSince: sql.placeholder("missingSince"), updatedAt: now })
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

    const scannedTrackValues = {
      album: sql.placeholder("album"),
      albumArtists: sql.placeholder("albumArtists"),
      artists: sql.placeholder("artists"),
      artworkId: sql.placeholder("artworkId"),
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
    } satisfies Required<Omit<SQLiteInsertValue<typeof tracks>, "id" | "missingSince">>;

    const saveTrack = transaction
      .insert(tracks)
      .values(scannedTrackValues)
      .onConflictDoUpdate({
        target: tracks.path,
        set: {
          ...Object.fromEntries(
            Object.entries(getColumns(tracks))
              .filter(([key]) => key in scannedTrackValues && key !== "createdAt" && key !== "path")
              .map(([key, column]) => [key, sql`excluded.${sql.identifier(column.name)}`]),
          ),
          missingSince: null,
        },
      })
      .prepare();

    let savedTracks = false;

    scannedTracks.forEach((track) => {
      const storedTrack = unseenTracks.get(track.path);
      unseenTracks.delete(track.path);

      if (track.kind === "unchanged") {
        if (storedTrack && storedTrack.missingSince !== null) {
          setMissingSince.run({ id: storedTrack.id, missingSince: null });
        }

        return;
      }

      if (track.artwork) saveArtwork.run(track.artwork);

      saveTrack.run({
        ...track,
        artworkId: track.artwork?.id ?? null,
      });
      savedTracks = true;
    });

    unseenTracks.forEach((track) => {
      if (track.missingSince !== null) return;

      setMissingSince.run({ id: track.id, missingSince: now });
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
      .set({ lastScanErrorMessage: null, lastScanOutcome: "ok", lastScannedAt: now, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();
  });
}

function updatedAtUnless(status: SourceRow["status"], now: number) {
  return sql`CASE WHEN ${librarySources.status} = ${status} THEN ${librarySources.updatedAt} ELSE ${now} END`;
}

function rejectSourceOverlap(database: LibraryTransaction, path: string) {
  const overlappingPath = database
    .select({ path: librarySources.path })
    .from(librarySources)
    .where(notForgottenSource)
    .all()
    .find((source) => source.path !== path && pathsOverlap(source.path, path));

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
