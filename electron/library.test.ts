import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { scanAudioFiles } from "./library";

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

  it("reuses stored metadata until a file changes", async () => {
    const folder = await createTemporaryFolder("lume-library-");
    const path = join(folder, "track.mp3");
    await writeFile(path, "original");
    const [scannedTrack] = await scanAudioFiles(folder);
    expect(scannedTrack).toBeDefined();
    if (!scannedTrack) return;

    const storedTrack = { ...scannedTrack, duration: 123 };
    const storedTracks = new Map([[path, storedTrack]]);

    await expect(scanAudioFiles(folder, storedTracks)).resolves.toEqual([storedTrack]);

    await writeFile(path, "changed file contents");
    const [changedTrack] = await scanAudioFiles(folder, storedTracks);
    expect(changedTrack).toMatchObject({ duration: null, fileSize: 21, path });
  });

  it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
    "skips inaccessible audio files",
    async () => {
      const folder = await createTemporaryFolder("lume-library-");
      const path = join(folder, "inaccessible.wav");
      await writeFile(path, createWaveAudio());
      await chmod(path, 0o000);

      await expect(scanAudioFiles(folder)).resolves.toEqual([]);
    },
  );
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
