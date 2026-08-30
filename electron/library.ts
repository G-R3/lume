import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";

type ParseFile = (typeof import("music-metadata"))["parseFile"];
const musicFolderFileName = "music-folder";

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

export async function readMusicFolder(userDataDirectory: string) {
  return readFile(join(userDataDirectory, musicFolderFileName), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
}

export async function saveMusicFolder(userDataDirectory: string, folder: string) {
  await mkdir(userDataDirectory, { recursive: true });
  await writeFile(join(userDataDirectory, musicFolderFileName), folder, "utf8");
}

export async function scanAudioFiles(folder: string): Promise<ScannedTrack[]> {
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
    .map((path) => scanTrack(path, parseFile), { concurrency: 8 })
    .toArray();
}

async function scanTrack(path: string, parseFile: ParseFile): Promise<ScannedTrack> {
  const extension = extname(path);
  const [file, metadata] = await Promise.all([
    stat(path),
    parseFile(path, { duration: true }).catch((error: Error) => {
      console.warn("Could not read audio metadata", { error, path });
      return null;
    }),
  ]);

  return {
    duration: metadata?.format.duration ?? null,
    fileSize: file.size,
    format: extension.slice(1).toUpperCase(),
    modifiedAt: Math.trunc(file.mtimeMs),
    name: basename(path, extension),
    path,
  };
}
