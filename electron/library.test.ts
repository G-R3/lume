import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { scanAudioFiles } from "./library";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) =>
      rm(folder, { force: true, recursive: true }),
    ),
  );
});

describe("scanAudioFiles", () => {
  it("recursively finds supported audio files", async () => {
    const folder = await mkdtemp(join(tmpdir(), "lume-library-"));
    temporaryFolders.push(folder);
    await mkdir(join(folder, "album"));
    await Promise.all([
      writeFile(join(folder, "song-one.MP3"), ""),
      writeFile(join(folder, "notes.txt"), ""),
      writeFile(join(folder, "album", "song-two.flac"), ""),
      writeFile(join(folder, "album", "cover.jpg"), ""),
    ]);

    await expect(scanAudioFiles(folder)).resolves.toEqual([
      join(folder, "album", "song-two.flac"),
      join(folder, "song-one.MP3"),
    ]);
  });

  it.each(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"])(
    "supports .%s files",
    async (extension) => {
      const folder = await mkdtemp(join(tmpdir(), "lume-library-"));
      temporaryFolders.push(folder);
      const path = join(folder, `track.${extension}`);
      await writeFile(path, "");

      await expect(scanAudioFiles(folder)).resolves.toEqual([path]);
    },
  );
});
