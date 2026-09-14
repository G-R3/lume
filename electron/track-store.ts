import { randomUUID } from "node:crypto";
import { and, DrizzleQueryError, eq, notExists, placeholder, sql } from "drizzle-orm";
import type { TrackMetadata } from "../shared/lib";
import type { LibraryDatabase } from "./database";
import { artwork, librarySources, tracks } from "./database/schema";
import { trackMetadataVersion, type ArtworkData, type ScannedTrack } from "./library";
import { isSourceScannable, markSourceTracksUnavailable } from "./library-store";

export type StoredTrack = TrackMetadata & {
  artworkId: string | null;
  available: boolean;
  id: string;
  path: string;
};

export function getTracks(database: LibraryDatabase): StoredTrack[] {
  return database
    .select({
      album: tracks.album,
      albumArtists: tracks.albumArtists,
      artists: tracks.artists,
      artworkId: tracks.artworkId,
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
      lossless: tracks.lossless,
      path: tracks.path,
      sampleRate: tracks.sampleRate,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      trackTotal: tracks.trackTotal,
      year: tracks.year,
    })
    .from(tracks)
    .orderBy(sql`${tracks.title} COLLATE NOCASE`, tracks.path)
    .all();
}

export function getArtworkData(database: LibraryDatabase, artworkId: string): ArtworkData | null {
  const storedArtwork = database
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

export function getTrackPath(database: LibraryDatabase, trackId: string) {
  return (
    database.select({ path: tracks.path }).from(tracks).where(eq(tracks.id, trackId)).get()?.path ??
    null
  );
}

export function getTrackMetadata(database: LibraryDatabase, sourceId: string) {
  return new Map(
    database
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

export function applySourceScan(
  database: LibraryDatabase,
  sourceId: string,
  scannedTracks: readonly ScannedTrack[],
) {
  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  try {
    database.transaction(
      (transaction) => {
        markSourceTracksUnavailable(transaction, sourceId, now);

        const restoreTrack = transaction
          .update(tracks)
          .set({ available: true, updatedAt: placeholder("updatedAt") })
          .where(and(eq(tracks.sourceId, sourceId), eq(tracks.path, placeholder("path"))))
          .prepare();

        const saveArtwork = transaction
          .insert(artwork)
          .values({
            data: placeholder("data"),
            id: placeholder("id"),
            mediaType: placeholder("mediaType"),
          })
          .onConflictDoNothing({ target: artwork.id })
          .prepare();

        const saveTrack = transaction
          .insert(tracks)
          .values({
            album: placeholder("album"),
            albumArtists: placeholder("albumArtists"),
            artists: placeholder("artists"),
            artworkId: placeholder("artworkId"),
            available: true,
            bitrate: placeholder("bitrate"),
            bitsPerSample: placeholder("bitsPerSample"),
            channelCount: placeholder("channelCount"),
            codec: placeholder("codec"),
            createdAt: now,
            discNumber: placeholder("discNumber"),
            discTotal: placeholder("discTotal"),
            duration: placeholder("duration"),
            fileSize: placeholder("fileSize"),
            format: placeholder("format"),
            genres: placeholder("genres"),
            id: placeholder("id"),
            lossless: placeholder("lossless"),
            metadataVersion: trackMetadataVersion,
            modifiedAt: placeholder("modifiedAt"),
            path: placeholder("path"),
            sampleRate: placeholder("sampleRate"),
            sourceId,
            title: placeholder("title"),
            trackNumber: placeholder("trackNumber"),
            trackTotal: placeholder("trackTotal"),
            updatedAt: now,
            year: placeholder("year"),
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

          if (track.artwork) {
            saveArtwork.run(track.artwork);
          }

          saveTrack.run({
            ...track,
            artworkId: track.artwork?.id ?? null,
            id: randomUUID(),
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
      },
      { behavior: "immediate" },
    );
  } catch (error) {
    if (error instanceof DrizzleQueryError && error.cause) throw error.cause;
    throw error;
  }

  return true;
}
