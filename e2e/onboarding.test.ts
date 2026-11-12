import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { expect, it, onTestFinished } from "vite-plus/test";
import { createTemporaryFolder } from "../tests/helpers/temp-folder";
import { createWaveAudio } from "../tests/helpers/wave-audio";
import { launchLume } from "./launch";

type PickerAnswer = { delay?: number; error?: string; folder?: string };

type Sample = { count: string | null; onboarding: boolean; rows: number; time: number };

async function launchFirstRun(prefix: string) {
  const profile = await createTemporaryFolder(prefix);
  const application = await launchLume(profile);
  const window = await application.firstWindow();
  await window.getByRole("heading", { name: "Add your music" }).waitFor();

  return { application, profile, window };
}

async function musicFolder(profile: string, name: string, titles: readonly string[]) {
  const folder = join(profile, name);
  await mkdir(folder);
  await Promise.all(
    titles.map((title) => writeFile(join(folder, `${title}.wav`), createWaveAudio(5))),
  );

  return folder;
}

async function answerPicker(application: ElectronApplication, answer: PickerAnswer) {
  await application.evaluate(({ dialog }, { delay, error, folder }) => {
    dialog.showOpenDialog = async () => {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

      if (error) throw new Error(error);

      return folder ? { canceled: false, filePaths: [folder] } : { canceled: true, filePaths: [] };
    };
  }, answer);
}

function chooseFolder(window: Page) {
  return window.getByRole("button", { name: "Choose folder" });
}

function onboardingScreen(window: Page) {
  return window.getByText("Add your music", { exact: true });
}

const frameRecorder = `(() => {
  const samples = [];
  window.onboardingSamples = samples;
  const sample = () => {
    samples.push({
      count: document.querySelector("[data-slot=track-count]")?.textContent ?? null,
      onboarding: [...document.querySelectorAll("h1")].some((h) => h.textContent === "Add your music"),
      rows: document.querySelectorAll("tr[data-entry-id]").length,
      time: performance.now(),
    });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
})()`;

async function recordFrames(window: Page) {
  await window.evaluate(frameRecorder);

  return async () => {
    const samples = await window.evaluate<Sample[]>("window.onboardingSamples");
    const firstRows = samples.find((frame) => frame.rows > 0);
    const lastOnboarding = samples.findLast((frame) => frame.onboarding);

    return {
      counts: new Set(
        samples.flatMap((frame) => (frame.rows > 0 && frame.count ? [frame.count] : [])),
      ),
      coveredAfterRows:
        firstRows && lastOnboarding ? (lastOnboarding.time - firstRows.time) / 1000 : 0,
    };
  };
}

async function expectSettledLibrary(window: Page, titles: readonly string[]) {
  const grid = window.getByRole("grid", { name: "Tracks" });

  for (const title of titles) {
    await grid.getByRole("row", { name: new RegExp(`^${title} `) }).waitFor();
  }

  await expect.poll(() => onboardingScreen(window).count(), { timeout: 5_000 }).toBe(0);
  await expect
    .poll(() => window.locator("[data-slot=track-count]").textContent(), { timeout: 5_000 })
    .toBe(String(titles.length));

  const opacities = await window.evaluate(`[
    "[data-slot=sidebar-container][data-side=left]",
    "header[aria-label=Player]",
    "tbody tr[data-entry-id]",
    "[data-slot=page-header] h1",
  ].map((selector) => getComputedStyle(document.querySelector(selector)).opacity)`);

  expect(opacities).toEqual(["1", "1", "1", "1"]);
}

it("keeps first run after a cancelled or failed pick and adds the next folder", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-retry-");
  const titles = ["alpha", "bravo"];
  const folder = await musicFolder(profile, "music", titles);

  await answerPicker(application, { delay: 600 });
  await chooseFolder(window).click();
  await expect.poll(() => chooseFolder(window).getAttribute("aria-busy")).toBe("true");
  await expect.poll(() => chooseFolder(window).getAttribute("aria-busy")).toBeNull();
  expect(await chooseFolder(window).isEnabled()).toBe(true);
  expect(await window.getByRole("alert").count()).toBe(0);

  await answerPicker(application, { error: "Picker exploded" });
  await chooseFolder(window).click();
  await window.getByRole("alert").filter({ hasText: "Picker exploded" }).waitFor();
  expect(await chooseFolder(window).isEnabled()).toBe(true);

  await answerPicker(application, { folder });
  await chooseFolder(window).click();
  await expectSettledLibrary(window, titles);
  expect(await window.getByRole("alert").count()).toBe(0);
});

it("covers the library with first run until the reveal finishes", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-reveal-");
  const titles = ["alpha", "bravo", "charlie"];
  await answerPicker(application, { folder: await musicFolder(profile, "music", titles) });
  const frames = await recordFrames(window);

  await chooseFolder(window).click();
  await expectSettledLibrary(window, titles);

  const { counts, coveredAfterRows } = await frames();
  expect(coveredAfterRows).toBeGreaterThan(0.8);
  expect(coveredAfterRows).toBeLessThan(3);
  expect(counts.has("00")).toBe(true);
});

it("fades first run out without the reveal under reduced motion", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-reduced-");
  const titles = ["alpha", "bravo", "charlie"];
  await window.emulateMedia({ reducedMotion: "reduce" });
  await answerPicker(application, { folder: await musicFolder(profile, "music", titles) });
  const frames = await recordFrames(window);

  await chooseFolder(window).click();
  await expectSettledLibrary(window, titles);

  const { counts, coveredAfterRows } = await frames();
  expect(coveredAfterRows).toBeLessThan(0.6);
  expect([...counts]).toEqual(["3"]);
});

it("lands on the empty library after choosing a folder with no audio", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-empty-");
  await answerPicker(application, { folder: await musicFolder(profile, "quiet", []) });

  await chooseFolder(window).click();
  await window.getByRole("heading", { name: "No audio in “quiet”" }).waitFor();
  await expect.poll(() => onboardingScreen(window).count(), { timeout: 5_000 }).toBe(0);
});

it("shows the scan error in the library after choosing an unreadable folder", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-unreadable-");
  const folder = await musicFolder(profile, "locked", ["alpha"]);
  await chmod(folder, 0o000);
  onTestFinished(() => chmod(folder, 0o755));
  await answerPicker(application, { folder });

  await chooseFolder(window).click();
  await window.getByRole("heading", { exact: true, name: "Tracks" }).waitFor();
  await expect.poll(() => onboardingScreen(window).count(), { timeout: 5_000 }).toBe(0);
  await window.getByText("locked couldn’t be scanned").waitFor();
});

it("finishes first run when a folder is chosen away from the tracks page", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-route-");
  await answerPicker(application, { folder: await musicFolder(profile, "music", ["alpha"]) });
  await window.evaluate('location.hash = "#/settings"');

  await chooseFolder(window).click();
  await window.getByRole("heading", { exact: true, name: "Folders" }).waitFor();
  await expect.poll(() => onboardingScreen(window).count(), { timeout: 5_000 }).toBe(0);
});

it("keeps the library shell after its only folder is forgotten and Lume restarts", async () => {
  const { application, profile, window } = await launchFirstRun("lume-onboarding-forgotten-");
  const titles = ["alpha"];
  await answerPicker(application, { folder: await musicFolder(profile, "music", titles) });
  await chooseFolder(window).click();
  await expectSettledLibrary(window, titles);

  await window.evaluate('location.hash = "#/settings"');
  await window.getByRole("button", { name: "More options for music" }).click();
  await window.getByRole("menuitem", { name: "Forget folder" }).click();
  await window.getByRole("heading", { name: "No folders" }).waitFor();
  await application.close();

  const restartedWindow = await (await launchLume(profile)).firstWindow();
  await restartedWindow.getByRole("heading", { name: "Add your music" }).waitFor();
  expect(await restartedWindow.getByRole("link", { name: "Settings" }).count()).toBe(1);
});
