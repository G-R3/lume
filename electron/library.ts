import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import type { TrackMetadata } from "../shared/lib";

export const audioContentTypes: ReadonlyMap<string, string> = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".oga", "audio/ogg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
]);

const artworkMediaTypes: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["image/png", "image/png"],
  ["png", "image/png"],
  ["image/webp", "image/webp"],
  ["webp", "image/webp"],
  ["image/bmp", "image/bmp"],
  ["bmp", "image/bmp"],
]);

const maximumArtworkBytes = 20 * 1024 * 1024;

export const trackMetadataVersion = 1;

export type ArtworkData = {
  data: Uint8Array;
  mediaType: string;
};

type ExtractedTrack = TrackMetadata & {
  artwork: (ArtworkData & { id: string }) | null;
  fileSize: number;
  kind: "changed";
  modifiedAt: number;
  path: string;
};

export type ScannedTrack = ExtractedTrack | { kind: "unchanged"; path: string };

export type StoredTrackMetadata = {
  fileSize: number;
  modifiedAt: number;
};

export async function scanAudioFiles(
  folder: string,
  storedTracks: ReadonlyMap<string, StoredTrackMetadata> = new Map(),
): Promise<ScannedTrack[]> {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  });

  const audioPaths = entries
    .filter((entry) => entry.isFile() && audioContentTypes.has(extname(entry.name).toLowerCase()))
    .map((file) => join(file.parentPath, file.name))
    .sort((left, right) => left.localeCompare(right));

  if (audioPaths.length === 0) return [];

  // Node streams reject null chunks, so keep nullable scan results inside an object.
  const results = await Readable.from(audioPaths)
    .map(async (path) => ({ track: await scanTrack(path, storedTracks.get(path)) }), {
      concurrency: 8,
    })
    .toArray();

  return results.flatMap((result) => (result.track ? [result.track] : []));
}

async function scanTrack(
  path: string,
  storedTrack: StoredTrackMetadata | undefined,
): Promise<ScannedTrack | null> {
  const file = await stat(path).catch((error: Error) => {
    console.warn("Could not read audio file", { error, path });

    return null;
  });

  if (!file) return null;

  const extension = extname(path);
  const modifiedAt = Math.trunc(file.mtimeMs);

  if (storedTrack?.fileSize === file.size && storedTrack.modifiedAt === modifiedAt) {
    return { kind: "unchanged", path };
  }

  const metadata = await parseTrackMetadata(path, basename(path, extension));

  if (!metadata) return null;

  return {
    ...metadata,
    fileSize: file.size,
    format: extension.slice(1).toUpperCase(),
    kind: "changed",
    modifiedAt,
    path,
  };
}

async function parseTrackMetadata(path: string, filename: string) {
  const { parseFile } = await import("music-metadata");

  return parseFile(path, { duration: true })
    .then((metadata) => {
      const taggedArtists = uniqueNonEmptyStrings(
        metadata.common.artists ?? [metadata.common.artist],
      );

      const albumArtists = uniqueNonEmptyStrings(
        metadata.common.albumartists ?? [metadata.common.albumartist],
      );

      const embeddedArtwork = metadata.common.picture?.flatMap((artwork) => {
        const mediaType = normalizeArtworkMediaType(artwork.format);

        if (
          artwork.data.byteLength === 0 ||
          artwork.data.byteLength > maximumArtworkBytes ||
          mediaType === null
        ) {
          return [];
        }

        return [
          {
            data: artwork.data,
            id: createHash("sha256").update(artwork.data).digest("hex"),
            mediaType,
          },
        ];
      })[0];

      return {
        album: cleanText(metadata.common.album),
        albumArtists,
        artists: taggedArtists,
        artwork: embeddedArtwork ?? null,
        bitrate: positiveNumber(metadata.format.bitrate),
        bitsPerSample: positiveInteger(metadata.format.bitsPerSample),
        channelCount: positiveInteger(metadata.format.numberOfChannels),
        codec: cleanText(metadata.format.codec),
        discNumber: positiveInteger(metadata.common.disk.no),
        discTotal: positiveInteger(metadata.common.disk.of),
        duration: positiveNumber(metadata.format.duration),
        genres: uniqueNonEmptyStrings(metadata.common.genre),
        lossless: metadata.format.lossless ?? null,
        title: cleanText(metadata.common.title) ?? filename,
        sampleRate: positiveInteger(metadata.format.sampleRate),
        trackNumber: positiveInteger(metadata.common.track.no),
        trackTotal: positiveInteger(metadata.common.track.of),
        year: positiveInteger(metadata.common.year),
      };
    })
    .catch((error: Error) => {
      console.warn("Could not read audio metadata", { error, path });

      if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) return null;

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
        genres: [],
        lossless: null,
        title: filename,
        sampleRate: null,
        trackNumber: null,
        trackTotal: null,
        year: null,
      };
    });
}

function cleanText(value: string | undefined) {
  return value?.trim() || null;
}

function uniqueNonEmptyStrings(values: readonly (string | undefined)[] | undefined) {
  return [...new Set((values ?? []).map(cleanText).filter((value) => value !== null))];
}

function positiveInteger(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function positiveNumber(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeArtworkMediaType(value: string) {
  return artworkMediaTypes.get(value.trim().toLowerCase()) ?? null;
}
