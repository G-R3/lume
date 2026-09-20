import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { scanAudioFiles } from "./library-files";

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

    await expect(scanAudioFiles(folder)).resolves.toMatchObject([
      {
        album: null,
        albumArtists: [],
        artists: [],
        duration: null,
        fileSize: 0,
        format: "FLAC",
        modifiedAt: expect.any(Number),
        title: "song-two",
        path: join(folder, "album", "song-two.flac"),
      },
      {
        album: null,
        albumArtists: [],
        artists: [],
        duration: null,
        fileSize: 0,
        format: "MP3",
        modifiedAt: expect.any(Number),
        title: "song-one",
        path: join(folder, "song-one.MP3"),
      },
    ]);
  });

  it("reads track duration from audio metadata", async () => {
    const folder = await createTemporaryFolder("lume-library-");
    const path = join(folder, "one-second.wav");
    await writeFile(path, createWaveAudio());

    await expect(scanAudioFiles(folder)).resolves.toMatchObject([
      {
        bitrate: 64_000,
        bitsPerSample: 8,
        channelCount: 1,
        codec: "PCM",
        duration: 1,
        fileSize: 8_044,
        format: "WAV",
        modifiedAt: expect.any(Number),
        title: "one-second",
        path,
        sampleRate: 8_000,
      },
    ]);
  });

  it("extracts identity, release, artwork, and position tags", async () => {
    const folder = await createTemporaryFolder("lume-library-");
    const path = join(folder, "fallback-name.mp3");
    await writeFile(
      path,
      createId3Tag([
        createTextFrame("TIT2", "Tagged title"),
        createTextFrame("TPE1", "First artist/Second artist"),
        createTextFrame("TPE2", "Album artist"),
        createTextFrame("TALB", "Tagged album"),
        createTextFrame("TDRC", "2007"),
        createTextFrame("TRCK", "4/11"),
        createTextFrame("TPOS", "2/3"),
        createTextFrame("TCON", "Electronic"),
        createPictureFrame(Uint8Array.from([1, 2, 3, 4])),
      ]),
    );

    await expect(scanAudioFiles(folder)).resolves.toMatchObject([
      {
        album: "Tagged album",
        albumArtists: ["Album artist"],
        artists: ["First artist", "Second artist"],
        artwork: {
          data: Uint8Array.from([1, 2, 3, 4]),
          id: expect.stringMatching(/^[\da-f]{64}$/u),
          mediaType: "image/png",
        },
        discNumber: 2,
        discTotal: 3,
        genres: ["Electronic"],
        title: "Tagged title",
        trackNumber: 4,
        trackTotal: 11,
        year: 2007,
      },
    ]);
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

function createId3Tag(frames: readonly Buffer[]) {
  const body = Buffer.concat(frames);
  const header = Buffer.alloc(10);
  header.write("ID3", 0);
  header.writeUInt8(3, 3);
  writeSyncSafeInteger(header, body.length, 6);

  return Buffer.concat([header, body]);
}

function createTextFrame(id: string, value: string) {
  return createId3Frame(id, Buffer.concat([Buffer.from([3]), Buffer.from(value)]));
}

function createPictureFrame(data: Uint8Array) {
  return createId3Frame(
    "APIC",
    Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0"), Buffer.from([3, 0]), data]),
  );
}

function createId3Frame(id: string, data: Uint8Array) {
  const header = Buffer.alloc(10);
  header.write(id, 0);
  header.writeUInt32BE(data.byteLength, 4);

  return Buffer.concat([header, data]);
}

function writeSyncSafeInteger(buffer: Buffer, value: number, offset: number) {
  buffer[offset] = (value >> 21) & 0x7f;
  buffer[offset + 1] = (value >> 14) & 0x7f;
  buffer[offset + 2] = (value >> 7) & 0x7f;
  buffer[offset + 3] = value & 0x7f;
}
