import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import { openTestDatabase } from "./helpers/database";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { registerIpc } from "../electron/ipc";
import { saveSource, scanSource } from "../electron/library";
import { getLibraryState } from "../electron/library-events";
import {
  type LibraryEvent,
  type LibraryRevision,
  lumeChannels,
  lumeEventChannels,
} from "../shared/lib";

type IpcEvent = { sender: { mainFrame: { url: string } }; senderFrame: { url: string } };

const handlers = new Map<string, (event: IpcEvent, sourceId?: number) => LibraryRevision>();

const sent: [string, LibraryEvent][] = [];

const window = {
  isDestroyed: () => false,
  webContents: { send: (channel: string, event: LibraryEvent) => sent.push([channel, event]) },
};

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: () => window, getAllWindows: () => [window] },
  dialog: {},
  ipcMain: {
    handle: (channel: string, handler: never) => handlers.set(channel, handler),
    on: () => {},
  },
  shell: {},
}));

const rendererUrl = "http://localhost:5173/";

const frame = { url: rendererUrl };

const ipcEvent: IpcEvent = { sender: { mainFrame: frame }, senderFrame: frame };

registerIpc({ rendererUrl, userDataDirectory: "/tmp" });

it("pushes each commit and scan to the window", async () => {
  await openTestDatabase();
  const folder = await createTemporaryFolder("lume-push-");
  await writeFile(join(folder, "song.mp3"), "");
  sent.length = 0;

  await scanSource((await saveSource(folder)).id);

  expect(sent.every(([channel]) => channel === lumeEventChannels.libraryEvent)).toBe(true);
  expect(sent.filter(([, event]) => event.kind === "changed")).toHaveLength(2);

  const last = sent.at(-1)?.[1];

  expect(last?.kind === "scans" && last.scans).toEqual(getLibraryState().scans);
  expect(getLibraryState().scans.scanning).toEqual([]);
});

it("returns from a rescan before the scan ends and reports the folder as scanning", async () => {
  await openTestDatabase();
  const folder = await createTemporaryFolder("lume-push-");
  const source = await saveSource(folder);

  const revision = handlers.get(lumeChannels.rescanSource)?.(ipcEvent, source.id);

  expect(revision).toBe(getLibraryState().revision);
  expect(getLibraryState().scans.scanning).toEqual([source.id]);
  await expect.poll(() => getLibraryState().scans.scanning).toEqual([]);
});
