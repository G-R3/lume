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
  const entries = await readdir(folder, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);

      if (entry.isDirectory()) return scanAudioFiles(path);
      if (
        entry.isFile() &&
        supportedAudioExtensions.has(extname(entry.name).toLowerCase())
      ) {
        return [path];
      }
      return [];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}
