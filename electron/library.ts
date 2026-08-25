import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

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

export async function scanAudioFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        audioContentTypes.has(extname(entry.name).toLowerCase()),
    )
    .map((file) => join(file.parentPath, file.name))
    .sort((left, right) => left.localeCompare(right));
}
