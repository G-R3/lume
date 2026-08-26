import { readdir } from "node:fs/promises";
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
  format: string;
  name: string;
  path: string;
};

async function scanTrack(path: string): Promise<ScannedTrack> {
  const { parseFile } = await import("music-metadata");

  const extension = extname(path);
  const metadata = await parseFile(path, { duration: true }).catch(
    (error: Error) => {
      console.warn("Could not read audio metadata", { error, path });
      return null;
    },
  );

  return {
    duration: metadata?.format.duration ?? null,
    format: extension.slice(1).toUpperCase(),
    name: basename(path, extension),
    path,
  };
}

export async function scanAudioFiles(folder: string): Promise<ScannedTrack[]> {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  });

  const audioPaths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        audioContentTypes.has(extname(entry.name).toLowerCase()),
    )
    .map((file) => join(file.parentPath, file.name))
    .sort((left, right) => left.localeCompare(right));

  return Readable.from(audioPaths).map(scanTrack, { concurrency: 8 }).toArray();
}
