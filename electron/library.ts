import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";

type ParseFile = (typeof import("music-metadata"))["parseFile"];

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

export async function scanAudioFiles(
  folder: string,
  storedTracks: ReadonlyMap<string, TrackMetadata> = new Map(),
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

  const { parseFile } = await import("music-metadata");
  return Readable.from(audioPaths)
    .map((path) => scanTrack(path, storedTracks.get(path), parseFile), {
      concurrency: 8,
    })
    .toArray();
}

async function scanTrack(
  path: string,
  storedTrack: TrackMetadata | undefined,
  parseFile: ParseFile,
): Promise<ScannedTrack> {
  const file = await stat(path);
  const extension = extname(path);
  const modifiedAt = Math.trunc(file.mtimeMs);
  const duration =
    storedTrack?.fileSize === file.size && storedTrack.modifiedAt === modifiedAt
      ? storedTrack.duration
      : await parseFile(path, { duration: true })
          .then((metadata) => metadata.format.duration ?? null)
          .catch((error: Error) => {
            console.warn("Could not read audio metadata", { error, path });
            return null;
          });

  return {
    duration,
    fileSize: file.size,
    format: extension.slice(1).toUpperCase(),
    modifiedAt,
    name: basename(path, extension),
    path,
  };
}
