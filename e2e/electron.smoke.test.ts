import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication } from "playwright";
import { afterEach, expect, it } from "vite-plus/test";
import { closeDatabase, initializeDatabase } from "../electron/database";
import { getTracks, saveSource, scanSource } from "../electron/library";

const launchedApplications: ElectronApplication[] = [];

const temporaryFolders: string[] = [];

const electronEnvironment = Object.fromEntries(
  Object.entries(process.env).flatMap((entry) =>
    entry[0] === "ELECTRON_RUN_AS_NODE" || entry[1] === undefined
      ? []
      : [[entry[0], entry[1]] as const],
  ),
);

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    launchedApplications.splice(0).map((application) => application.close().catch(() => {})),
  );
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

it("keeps a scanned track and playlist working after restart", async () => {
  const profile = await mkdtemp(join(tmpdir(), "lume-electron-smoke-"));
  temporaryFolders.push(profile);
  const sourceDirectory = join(profile, "music");
  await mkdir(sourceDirectory);
  await writeWaveFile(join(sourceDirectory, "smoke.wav"));

  await initializeDatabase({
    location: join(profile, "lume-dev.sqlite"),
    migrationsFolder: join(process.cwd(), "drizzle"),
  });
  const source = await saveSource(sourceDirectory);
  await scanSource(source.id);
  expect(getTracks().map((track) => track.title)).toEqual(["smoke"]);
  closeDatabase();

  const firstApplication = await launchLume(profile);
  launchedApplications.push(firstApplication);
  const firstWindow = await firstApplication.firstWindow();
  await firstWindow.getByRole("heading", { exact: true, name: "All Tracks" }).waitFor();
  expect(await firstWindow.getByText("1 tracks").isVisible()).toBe(true);

  await firstWindow.getByRole("button", { name: "Create playlist" }).click();
  const creationDialog = firstWindow.getByRole("dialog");
  await creationDialog.getByLabel("Title").fill("Smoke playlist");
  await creationDialog.getByRole("button", { name: "Create playlist" }).click();
  await firstWindow.getByRole("heading", { level: 2, name: "Smoke playlist" }).waitFor();

  await firstWindow.getByRole("link", { name: /All tracks/ }).click();
  await firstWindow.getByRole("button", { exact: true, name: "More options for smoke" }).click();
  await firstWindow.getByRole("menuitem", { name: "Add to playlist" }).click();
  await firstWindow.getByRole("dialog").getByRole("button", { name: "Smoke playlist" }).click();
  await firstWindow.getByText("Added to Smoke playlist").waitFor();

  await firstWindow.getByRole("link", { name: "Smoke playlist" }).click();
  await firstWindow.getByRole("button", { exact: true, name: "smoke" }).click();
  await firstWindow.getByRole("button", { name: "Pause" }).waitFor();
  expect(await firstWindow.locator("audio").getAttribute("src")).toMatch(
    /^lume:\/\/app\/media\/\d+$/,
  );

  await firstApplication.evaluate((electronApi) => {
    electronApi.BrowserWindow.getAllWindows()[0]?.minimize();
  });
  await expect
    .poll(() =>
      firstApplication.evaluate((electronApi) =>
        electronApi.BrowserWindow.getAllWindows()[0]?.isMinimized(),
      ),
    )
    .toBe(true);

  const secondInstance = spawn(
    firstApplication.process().spawnfile,
    [".", `--user-data-dir=${profile}`],
    {
      cwd: process.cwd(),
      env: electronEnvironment,
      stdio: "ignore",
    },
  );

  expect(
    await new Promise<number | null>((resolve, reject) => {
      secondInstance.once("error", reject);
      secondInstance.once("exit", resolve);
    }),
  ).toBe(0);
  await expect
    .poll(() =>
      firstApplication.evaluate((electronApi) => {
        const windows = electronApi.BrowserWindow.getAllWindows();

        return windows.length === 1 && windows[0]?.isMinimized() === false;
      }),
    )
    .toBe(true);

  await firstApplication.close();
  launchedApplications.pop();

  const restartedApplication = await launchLume(profile);
  launchedApplications.push(restartedApplication);
  const restartedWindow = await restartedApplication.firstWindow();
  await restartedWindow.getByRole("heading", { exact: true, name: "All Tracks" }).waitFor();
  await restartedWindow.getByRole("link", { name: "Smoke playlist" }).click();
  await restartedWindow.getByRole("heading", { level: 2, name: "Smoke playlist" }).waitFor();
  expect(
    await restartedWindow.getByRole("button", { exact: true, name: "smoke" }).isVisible(),
  ).toBe(true);
});

function launchLume(profile: string) {
  return electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: electronEnvironment,
  });
}

async function writeWaveFile(path: string) {
  const sampleRate = 8_000;
  const dataLength = sampleRate * 2;
  const bytes = Buffer.alloc(44 + dataLength);

  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataLength, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataLength, 40);

  await writeFile(path, bytes);
}
