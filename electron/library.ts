import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";

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

export type ScannedTrack = {
  duration: number | null;
  fileSize: number;
  format: string;
  modifiedAt: number;
  name: string;
  path: string;
};

export type TrackMetadata = Pick<ScannedTrack, "duration" | "fileSize" | "modifiedAt">;
export type AudioFileScan = {
  skippedFileCount: number;
  tracks: ScannedTrack[];
};

export async function scanAudioFiles(
  folder: string,
  storedTracks: ReadonlyMap<string, TrackMetadata> = new Map(),
): Promise<AudioFileScan> {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  });

  const audioPaths = entries
    .filter((entry) => entry.isFile() && audioContentTypes.has(extname(entry.name).toLowerCase()))
    .map((file) => join(file.parentPath, file.name))
    .sort((left, right) => left.localeCompare(right));

  if (audioPaths.length === 0) return { skippedFileCount: 0, tracks: [] };

  // Node streams reject null chunks, so keep nullable scan results inside an object.
  const results = await Readable.from(audioPaths)
    .map(async (path) => ({ track: await scanTrack(path, storedTracks.get(path)) }), {
      concurrency: 8,
    })
    .toArray();
  const tracks = results.flatMap((result) => (result.track ? [result.track] : []));

  return {
    skippedFileCount: results.length - tracks.length,
    tracks,
  };
}

async function scanTrack(
  path: string,
  storedTrack: TrackMetadata | undefined,
): Promise<ScannedTrack | null> {
  const file = await stat(path).catch((error: Error) => {
    console.warn("Could not read audio file", { error, path });
    return null;
  });

  if (!file) return null;

  const extension = extname(path);
  const modifiedAt = Math.trunc(file.mtimeMs);
  const duration =
    storedTrack?.fileSize === file.size && storedTrack.modifiedAt === modifiedAt
      ? storedTrack.duration
      : await parseTrackDuration(path);

  if (duration === undefined) return null;

  return {
    duration,
    fileSize: file.size,
    format: extension.slice(1).toUpperCase(),
    modifiedAt,
    name: basename(path, extension),
    path,
  };
}

async function parseTrackDuration(path: string) {
  const { parseFile } = await import("music-metadata");
  return parseFile(path, { duration: true })
    .then((metadata) => metadata.format.duration ?? null)
    .catch((error: Error) => {
      console.warn("Could not read audio metadata", { error, path });
      if ("code" in error && (error.code === "EACCES" || error.code === "EPERM")) return undefined;
      return null;
    });
}
