import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { saveSource, scanEnabledSources } from "../electron/library";
import { registerIpc } from "../electron/ipc";
import { lumeChannels, parseLibrarySnapshot, type LibraryUpdate } from "../shared/lib";

type IpcEvent = { sender: { mainFrame: { url: string } }; senderFrame: { url: string } };

let startupScanHandler: ((event: IpcEvent) => Promise<LibraryUpdate | null>) | undefined;

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false }) },
  dialog: {},
  ipcMain: {
    handle: (channel: string, handler: never) => {
      if (channel === lumeChannels.awaitStartupScan) startupScanHandler = handler;
    },
    on: () => {},
  },
  shell: {},
}));

const rendererUrl = "http://localhost:5173/";

const frame = { url: rendererUrl };

const event: IpcEvent = { sender: { mainFrame: frame }, senderFrame: frame };

it("replies with the stored library when the scan fails after committing a source", async () => {
  const database = await openTestDatabase();
  const first = await createTemporaryFolder("lume-first-");
  const second = await createTemporaryFolder("lume-second-");
  await writeFile(join(first, "added-at-startup.mp3"), "");
  await writeFile(join(second, "other.mp3"), "");
  await saveSource(first);
  const secondSource = await saveSource(second);

  database.$client.exec(`
    CREATE TRIGGER reject_second BEFORE INSERT ON tracks
    WHEN NEW.source_id = ${secondSource.id}
    BEGIN SELECT RAISE(ABORT, 'track write failed'); END;
  `);

  const startupScan = scanEnabledSources();
  startupScan.catch(() => {});
  registerIpc({ rendererUrl, startupScan, userDataDirectory: "/tmp" });

  const reply = await startupScanHandler?.(event);

  expect(reply?.kind).toBe("snapshot");

  const library = reply?.kind === "snapshot" ? parseLibrarySnapshot(reply.library) : null;

  expect(library?.kind === "library" && library.tracks.map((track) => track.title)).toEqual([
    "added-at-startup",
  ]);
});
