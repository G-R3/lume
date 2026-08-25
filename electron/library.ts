import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const supportedAudioExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".ogg",
  ".opus",
  ".wav",
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
        supportedAudioExtensions.has(extname(entry.name).toLowerCase()),
    )
    .map((file) => join(file.parentPath, file.name))
    .sort((left, right) => left.localeCompare(right));
}
