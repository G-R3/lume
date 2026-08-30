import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { readMusicFolder, saveMusicFolder, scanAudioFiles } from "./library";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

describe("scanAudioFiles", () => {
  it("recursively finds supported audio files", async () => {
    const folder = await createTemporaryFolder("lume-library-");
    await mkdir(join(folder, "album"));
    await Promise.all([
      writeFile(join(folder, "song-one.MP3"), ""),
      writeFile(join(folder, "notes.txt"), ""),
      writeFile(join(folder, "album", "song-two.flac"), ""),
      writeFile(join(folder, "album", "cover.jpg"), ""),
    ]);

    await expect(scanAudioFiles(folder)).resolves.toEqual([
      {
        duration: null,
        fileSize: 0,
        format: "FLAC",
        modifiedAt: expect.any(Number),
        name: "song-two",
        path: join(folder, "album", "song-two.flac"),
      },
      {
        duration: null,
        fileSize: 0,
        format: "MP3",
        modifiedAt: expect.any(Number),
        name: "song-one",
        path: join(folder, "song-one.MP3"),
      },
    ]);
  });

  it.each(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"])(
    "supports .%s files",
    async (extension) => {
      const folder = await createTemporaryFolder("lume-library-");
      const path = join(folder, `track.${extension}`);
      await writeFile(path, "");

      await expect(scanAudioFiles(folder)).resolves.toEqual([
        {
          duration: null,
          fileSize: 0,
          format: extension.toUpperCase(),
          modifiedAt: expect.any(Number),
          name: "track",
          path,
        },
      ]);
    },
  );

  it("reads track duration from audio metadata", async () => {
    const folder = await createTemporaryFolder("lume-library-");
    const path = join(folder, "one-second.wav");
    await writeFile(path, createWaveAudio());

    await expect(scanAudioFiles(folder)).resolves.toEqual([
      {
        duration: 1,
        fileSize: 8_044,
        format: "WAV",
        modifiedAt: expect.any(Number),
        name: "one-second",
        path,
      },
    ]);
  });
});

describe("music folder settings", () => {
  it("returns null before a folder has been saved", async () => {
    const userDataDirectory = await createTemporaryFolder("lume-settings-");

    await expect(readMusicFolder(userDataDirectory)).resolves.toBeNull();
  });

  it("remembers the selected folder exactly", async () => {
    const userDataDirectory = await createTemporaryFolder("lume-settings-");
    const musicFolder = join(userDataDirectory, "Music library 🎵");

    await saveMusicFolder(userDataDirectory, musicFolder);

    await expect(readMusicFolder(userDataDirectory)).resolves.toBe(musicFolder);
  });
});

async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  temporaryFolders.push(folder);
  return folder;
}

function createWaveAudio() {
  const sampleRate = 8_000;
  const audio = Buffer.alloc(44 + sampleRate, 128);
  audio.write("RIFF", 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(sampleRate, 24);
  audio.writeUInt32LE(sampleRate, 28);
  audio.writeUInt16LE(1, 32);
  audio.writeUInt16LE(8, 34);
  audio.write("data", 36);
  audio.writeUInt32LE(sampleRate, 40);
  return audio;
}
