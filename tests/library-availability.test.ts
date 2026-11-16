import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { getActiveSource, libraryTracks } from "./helpers/library";
import { createTemporaryFolder } from "./helpers/temp-folder";
import {
  disableSource,
  forgetSource,
  getSources,
  saveSource,
  scanSource,
  setTracksLiked,
} from "../electron/library";
import { scanAudioFiles } from "../electron/library-files";
import { createPlaylist, getPlaylist } from "../electron/playlists";

async function createScannedSource(titles: string[]) {
  const database = await openTestDatabase();
  const folder = await createTemporaryFolder("lume-source-");
  await Promise.all(titles.map((title) => writeFile(join(folder, `${title}.mp3`), "")));
  const source = await saveSource(folder);
  const scan = () => scanSource(source.id, (_path, metadata) => scanAudioFiles(folder, metadata));
  await scan();

  const storedTracks = () =>
    database.$client
      .prepare("SELECT id, title, missing_since, updated_at FROM tracks ORDER BY title")
      .all();

  return { folder, scan, source, storedTracks };
}

function reasons() {
  return libraryTracks().map(({ title, unavailableReason }) => ({ title, unavailableReason }));
}

describe("derived track availability", () => {
  it("names why each track can't play, and a folder reason wins over a missing file", async () => {
    const { folder, scan, source } = await createScannedSource(["gone", "kept"]);
    await rm(join(folder, "gone.mp3"));
    await scan();
    expect(reasons()).toEqual([
      { title: "gone", unavailableReason: "file-missing" },
      { title: "kept", unavailableReason: null },
    ]);

    for (const [code, reason] of [
      ["ENOENT", "source-missing"],
      ["EACCES", "source-permission"],
      ["EIO", "source-unreadable"],
    ] as const) {
      await scanSource(source.id, async () => {
        throw Object.assign(new Error(code), { code });
      });
      expect(reasons()).toEqual([
        { title: "gone", unavailableReason: reason },
        { title: "kept", unavailableReason: reason },
      ]);
    }

    await scan();
    disableSource(source.id);
    expect(reasons()).toEqual([
      { title: "gone", unavailableReason: "source-off" },
      { title: "kept", unavailableReason: "source-off" },
    ]);

    forgetSource(source.id);
    expect(reasons()).toEqual([
      { title: "gone", unavailableReason: "source-forgotten" },
      { title: "kept", unavailableReason: "source-forgotten" },
    ]);
    expect(libraryTracks().every((track) => track.available === false)).toBe(true);
  });

  it("closes a folder that can't be read without touching its tracks, and reopens it", async () => {
    const { folder, scan, source, storedTracks } = await createScannedSource(["kept", "gone"]);
    await rm(join(folder, "gone.mp3"));
    await scan();
    const tracksBefore = storedTracks();
    const hidden = `${folder}-unplugged`;

    await rename(folder, hidden);
    expect(await scan()).toEqual({ kind: "committed" });
    expect(reasons()).toEqual([
      { title: "gone", unavailableReason: "source-missing" },
      { title: "kept", unavailableReason: "source-missing" },
    ]);
    expect(storedTracks()).toEqual(tracksBefore);
    expect(await scan()).toEqual({ kind: "committed" });

    await rename(hidden, folder);
    expect(await scan()).toEqual({ kind: "committed" });
    expect(reasons()).toEqual([
      { title: "gone", unavailableReason: "file-missing" },
      { title: "kept", unavailableReason: null },
    ]);
    expect(storedTracks()).toEqual(tracksBefore);
    expect(getActiveSource(source.id).status).toMatchObject({ kind: "scanned", trackCount: 1 });
  });

  it("shows a failed folder's newest failure reason on its tracks", async () => {
    const { source } = await createScannedSource(["song"]);

    const fail = (code: string) =>
      scanSource(source.id, async () => {
        throw Object.assign(new Error(code), { code });
      });

    expect(await fail("ENOENT")).toEqual({ kind: "committed" });
    expect(reasons()).toEqual([{ title: "song", unavailableReason: "source-missing" }]);
    expect(await fail("EACCES")).toEqual({ kind: "committed" });
    expect(reasons()).toEqual([{ title: "song", unavailableReason: "source-permission" }]);
    expect(await fail("EACCES")).toEqual({ kind: "committed" });
  });

  it("keeps when a file first went missing and restores it with its ID and like", async () => {
    const { folder, scan, storedTracks } = await createScannedSource(["song"]);
    const [song] = libraryTracks();
    setTracksLiked({ liked: true, trackIds: [song.id] });

    await rm(join(folder, "song.mp3"));
    expect(await scan()).toEqual({ kind: "committed" });
    expect(reasons()).toEqual([{ title: "song", unavailableReason: "file-missing" }]);
    const [missing] = storedTracks();
    expect(missing.missing_since).toEqual(expect.any(Number));

    expect(await scan()).toEqual({ kind: "committed" });
    expect(storedTracks()).toEqual([missing]);

    await writeFile(join(folder, "song.mp3"), "");
    await scan();
    expect(libraryTracks()).toMatchObject([
      { available: true, id: song.id, likedAt: expect.any(Number), unavailableReason: null },
    ]);
  });

  it("writes nothing when the same scan commits twice", async () => {
    const { scan, storedTracks } = await createScannedSource(["first", "second"]);
    const tracksBefore = storedTracks();

    expect(await scan()).toEqual({ kind: "committed" });
    expect(storedTracks()).toEqual(tracksBefore);
  });

  it("keeps a forgotten folder's tracks for playlists and plays them when it is added again", async () => {
    const { folder, source } = await createScannedSource(["song"]);
    const [song] = libraryTracks();
    const playlist = createPlaylist({ description: null, title: "Keepers", trackIds: [song.id] });

    forgetSource(source.id);
    expect(getSources()).toEqual([]);
    expect(reasons()).toEqual([{ title: "song", unavailableReason: "source-forgotten" }]);
    expect(getPlaylist(playlist.id).playlist?.tracks.map((entry) => entry.trackId)).toEqual([
      song.id,
    ]);

    await saveSource(folder);
    expect(reasons()).toEqual([{ title: "song", unavailableReason: null }]);
  });

  it("gives a track moved to another folder that folder's gate", async () => {
    await openTestDatabase();
    const parent = await createTemporaryFolder("lume-source-");
    const child = join(parent, "album");
    await mkdir(child);
    await writeFile(join(child, "song.mp3"), "");
    const childSource = await saveSource(child);
    await scanSource(childSource.id, () => scanAudioFiles(child));
    forgetSource(childSource.id);
    const parentSource = await saveSource(parent);
    await scanSource(parentSource.id, () => scanAudioFiles(parent));

    disableSource(parentSource.id);

    expect(reasons()).toEqual([{ title: "song", unavailableReason: "source-off" }]);
  });
});
