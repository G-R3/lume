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
  type LibraryUpdate,
  type TrackLikeInput,
  type CompactTrack,
  type CompactTrackKey,
  compactAlbumArtists,
  compactTrackKeys,
  getArtworkUrl,
  getTrackUrl,
  stringifyCompactLibrary,
  stringifyFirstRunLibrary,
} from "../shared/lib";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDatabase, runImmediateTransaction, type LibraryDatabase } from "./database";
import { artwork, librarySources, tracks, trackState } from "./database/schema";
import { scanAudioFiles, trackMetadataVersion, type ScannedTrack } from "./library-files";
import { getPlaylists } from "./playlists";

type SourceWriter = Pick<LibraryDatabase, "update">;

type SourceScanResult = "changed" | "skipped" | "superseded" | "unchanged";

type LibraryScanResult = "changed" | "none" | "unchanged";

const scanVersions = new WeakMap<LibraryDatabase, Map<number, number>>();

const {
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
      const artists = displayArtists(track.artists);

      return {
        addedAt: track.createdAt,
        album: displayAlbum(track.album),
        albumArtists: displayAlbumArtists(track.albumArtists, artists),
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

function displayAlbum(album: string | null) {
  return album ?? "Unknown album";
}

function displayArtists(artists: string[]) {
  return artists.length > 0 ? artists : ["Unknown artist"];
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
} satisfies Record<CompactTrackKey, SQLiteColumn>;

const compactTrackColumns = Object.fromEntries(
  compactTrackKeys.map((key) => [key, storedTrackColumns[key]]),
);

type StoredValue<Column extends SQLiteColumn> =
  | Column["_"]["driverParam"]
  | (Column["_"]["notNull"] extends true ? never : null);

type StoredValues<Keys extends readonly CompactTrackKey[]> = {
  -readonly [Index in keyof Keys]: StoredValue<(typeof storedTrackColumns)[Keys[Index]]>;
};

type StoredTrackRow = StoredValues<typeof compactTrackKeys>;

export function getLibrarySnapshotJson() {
  const sources = getSources();

  if (sources.length === 0 && !hasForgottenSources()) {
    return stringifyFirstRunLibrary();
  }

  // SAFETY: Drizzle returns `.values()` rows untyped.
  // Each row holds the raw SQLite values of `compactTrackColumns`, in that order.
  // tests/compact-snapshot.test.ts checks every position.
  const rows = getDatabase()
    .select(compactTrackColumns)
    .from(tracks)
    .leftJoin(trackState, eq(trackState.trackId, tracks.id))
    .orderBy(sql`${tracks.title} COLLATE NOCASE`, tracks.path)
    .values() as StoredTrackRow[];

  return stringifyCompactLibrary(getPlaylists(), sources, rows.map(compactStoredTrack));
}

function compactStoredTrack(row: StoredTrackRow): CompactTrack {
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

  const artists = displayArtists(tracks.artists.mapFromDriverValue(storedArtists));

  const albumArtists = displayAlbumArtists(
    tracks.albumArtists.mapFromDriverValue(storedAlbumArtists),
    artists,
  );

  return [
    addedAt,
    displayAlbum(album),
    compactAlbumArtists(albumArtists, artists),
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

function getEnabledSources() {
  return selectSources(and(eq(librarySources.enabled, true), isNull(librarySources.forgottenAt)))
    .orderBy(librarySources.createdAt)
    .all();
}

function getEnabledSource(sourceId: number) {
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

export async function scanEnabledSources(scanFiles = scanAudioFiles): Promise<LibraryScanResult> {
  const sources = getEnabledSources();

  if (sources.length === 0) return "none";

  const results: SourceScanResult[] = [];

  for (const source of sources) {
    results.push(await scanSource(source.id, scanFiles));
  }

  return results.every((result) => result === "unchanged") ? "unchanged" : "changed";
}

export function getScanUpdate(result: LibraryScanResult): LibraryUpdate | null {
  if (result === "none") return null;

  if (result === "unchanged") return { kind: "sources", sources: getSources() };

  return { kind: "snapshot", library: getLibrarySnapshotJson() };
}

export async function scanSource(
  sourceId: number,
  scanFiles = scanAudioFiles,
): Promise<SourceScanResult> {
  const source = getEnabledSource(sourceId);

  if (!source) return "skipped";

  const database = getDatabase();
  const versions = scanVersions.get(database) ?? new Map<number, number>();
  scanVersions.set(database, versions);
  const version = (versions.get(sourceId) ?? 0) + 1;
  versions.set(sourceId, version);
  let scannedTracks: ScannedTrack[];

  try {
    scannedTracks = await scanFiles(source.path, getTrackMetadata(sourceId));
  } catch (error) {
    if (versions.get(sourceId) !== version) return "superseded";

    console.warn("Could not read library source", { error, sourceId });
    const message = error instanceof Error ? getScanErrorMessage(error) : String(error);

    return applyScanFailure(sourceId, message) ? "changed" : "skipped";
  }

  if (versions.get(sourceId) !== version) return "superseded";

  return applySourceScan(sourceId, scannedTracks);
}

function applyScanFailure(sourceId: number, error: string) {
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

function getTracks() {
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

function getTrackMetadata(sourceId: number) {
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

function applySourceScan(
  sourceId: number,
  scannedTracks: readonly ScannedTrack[],
): Exclude<SourceScanResult, "superseded"> {
  const database = getDatabase();

  if (!isSourceScannable(database, sourceId)) return "skipped";

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

    return tracksChanged ? "changed" : "unchanged";
  });
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
