import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { libraryTracks } from "../tests/helpers/library";
import { createTemporaryFolder } from "../tests/helpers/temp-folder";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication } from "playwright";
import { afterEach, expect, it } from "vite-plus/test";
import { createWaveAudio } from "../tests/helpers/wave-audio";
import { closeDatabase, initializeDatabase } from "../electron/database";
import { saveSource, scanSource } from "../electron/library";

const launchedApplications: ElectronApplication[] = [];

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
});

it("keeps a scanned track and playlist working after restart", async () => {
  const profile = await createTemporaryFolder("lume-electron-smoke-");
  const sourceDirectory = join(profile, "music");
  await mkdir(sourceDirectory);
  await writeFile(join(sourceDirectory, "smoke.wav"), createWaveAudio(1, 16));

  await initializeDatabase({
    location: join(profile, "lume-dev.sqlite"),
    migrationsFolder: join(process.cwd(), "drizzle"),
  });
  const source = await saveSource(sourceDirectory);
  await scanSource(source.id);
  expect(libraryTracks().map((track) => track.title)).toEqual(["smoke"]);
  closeDatabase();

  const firstApplication = await launchLume(profile);
  launchedApplications.push(firstApplication);
  const firstWindow = await firstApplication.firstWindow();
  await firstWindow.getByRole("heading", { exact: true, name: "Tracks" }).waitFor();
  expect(
    await firstWindow
      .getByRole("grid", { name: "Tracks" })
      .getByRole("row", { name: /smoke/ })
      .isVisible(),
  ).toBe(true);

  await firstWindow.getByRole("button", { name: "Create playlist" }).click();
  const creationDialog = firstWindow.getByRole("dialog");
  await creationDialog.getByLabel("Title").fill("Smoke playlist");
  await creationDialog.getByRole("button", { name: "Create" }).click();
  await firstWindow.getByRole("heading", { level: 1, name: "Smoke playlist" }).last().waitFor();

  await firstWindow.getByRole("link", { name: /^Tracks/ }).click();
  await firstWindow.getByRole("link", { name: "Smoke playlist" }).click({ button: "right" });
  await firstWindow.getByRole("menuitem", { name: "Delete playlist" }).click();
  const deleteDialog = firstWindow.getByRole("alertdialog", { name: "Delete Smoke playlist?" });
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await firstWindow
    .getByRole("button", { name: "More options for Smoke playlist", exact: true })
    .click();
  await firstWindow.getByRole("menuitem", { name: "Delete playlist" }).click();
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await deleteDialog.waitFor({ state: "hidden" });
  await firstWindow.getByRole("link", { name: "Smoke playlist" }).waitFor();
  await firstWindow.getByRole("heading", { name: "Tracks", exact: true }).waitFor();
  // The playlist menu stays in the page while it animates closed. Wait so its items don't mix with the track menu's.
  await firstWindow.getByRole("menu").waitFor({ state: "detached" });

  await firstWindow.getByRole("button", { exact: true, name: "More options for smoke" }).click();
  const trackMenuActions = await firstWindow.getByRole("menuitem").allTextContents();
  await firstWindow.keyboard.press("Escape");
  await firstWindow
    .getByRole("grid", { name: "Tracks" })
    .getByRole("row", { name: /smoke/ })
    .click({
      button: "right",
    });
  expect(await firstWindow.getByRole("menuitem").allTextContents()).toEqual(trackMenuActions);
  await firstWindow.getByRole("menuitem", { name: "Add to playlist" }).click();
  await firstWindow
    .getByRole("dialog")
    .getByRole("option", { name: /Smoke playlist/ })
    .click();
  await firstWindow.getByText("Added to Smoke playlist").waitFor();

  await firstWindow.getByRole("link", { name: "Smoke playlist" }).click();
  await firstWindow
    .getByRole("grid", { name: "Smoke playlist" })
    .getByRole("row", { name: /smoke/ })
    .dblclick();
  await firstWindow.getByRole("button", { name: "Pause" }).waitFor();
  expect(await firstWindow.locator("audio").getAttribute("src")).toMatch(
    /^lume:\/\/app\/media\/\d+$/,
  );

  const playlistRow = firstWindow
    .getByRole("grid", { name: "Smoke playlist" })
    .getByRole("row", { name: /smoke/ });

  await playlistRow.click({ button: "right" });
  expect(
    await firstWindow.getByRole("menuitem", { name: "Remove from Smoke playlist" }).count(),
  ).toBe(1);
  await firstWindow.getByRole("menuitem", { name: "Add to queue" }).click();
  await firstWindow.getByRole("button", { name: "Open queue sidebar" }).click();
  const queue = firstWindow.getByRole("complementary", { name: "Playback queue" });
  await queue.getByRole("button", { name: "Play smoke now" }).click({ button: "right" });
  await firstWindow.getByRole("menuitem", { name: "Remove from queue" }).click();
  await queue.getByRole("button", { name: "Play smoke now" }).waitFor({ state: "detached" });

  await playlistRow.click({ button: "right" });
  await firstWindow.getByRole("menuitem", { name: "Add to queue" }).click();
  await queue.getByRole("button", { name: "More options for smoke" }).click();
  await firstWindow.getByRole("menuitem", { name: "Remove from queue" }).click();
  await queue.getByRole("button", { name: "Play smoke now" }).waitFor({ state: "detached" });

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
  await restartedWindow.getByRole("heading", { exact: true, name: "Tracks" }).waitFor();
  await restartedWindow.getByRole("link", { name: "Smoke playlist" }).click();
  await restartedWindow.getByRole("heading", { level: 1, name: "Smoke playlist" }).last().waitFor();
  expect(
    await restartedWindow
      .getByRole("grid", { name: "Smoke playlist" })
      .getByRole("row", { name: /smoke/ })
      .isVisible(),
  ).toBe(true);
});

function launchLume(profile: string) {
  return electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: electronEnvironment,
  });
}
