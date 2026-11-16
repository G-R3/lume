import { rename } from "node:fs/promises";
import { join } from "node:path";
import type { ElementHandle, Page } from "playwright";
import { expect, it } from "vite-plus/test";
import { createLibraryProfile, launchLume } from "./launch";

const missingNotice = (title: string) =>
  `Could not play ${title}. Its file was moved, deleted, or disconnected.`;

function paintedCopies(window: Page, text: string) {
  return window.getByText(text).evaluateAll(
    (
      elements: {
        closest(selector: string): object | null;
        getBoundingClientRect(): { width: number };
      }[],
    ) =>
      elements.flatMap((element) =>
        element.getBoundingClientRect().width > 1
          ? [element.closest("#queue-sidebar") ? "sidebar" : "page"]
          : [],
      ),
  );
}

async function isCurrentAlert(window: Page, alert: ElementHandle, text: string) {
  const current = await window.getByRole("alert").filter({ hasText: text }).elementHandle();

  return alert.evaluate((node, other) => node.isConnected && node === other, current);
}

it("shows each playback notice once and announces it from one stable alert", async () => {
  const { profile, sourceDirectory } = await createLibraryProfile("lume-electron-notices-", [
    "alpha",
    "bravo",
    "charlie",
    "delta",
  ]);

  const window = await (await launchLume(profile)).firstWindow();
  const tracks = window.getByRole("grid", { name: "Tracks" });
  const alphaNotice = missingNotice("alpha");
  const charlieNotice = missingNotice("charlie");

  await rename(join(sourceDirectory, "alpha.wav"), join(sourceDirectory, "alpha.moved"));
  await tracks.getByRole("row", { name: /alpha/ }).dblclick();
  await window.getByText(alphaNotice).first().waitFor();

  const alert = window.getByRole("alert").filter({ hasText: alphaNotice });
  const alertNode = await alert.elementHandle();
  const toggleQueue = (name: string) => window.getByRole("button", { name }).click();

  expect(await paintedCopies(window, alphaNotice), "one page copy with the queue closed").toEqual([
    "page",
  ]);
  expect(await alert.count(), "one alert with the queue closed").toBe(1);

  await toggleQueue("Open queue sidebar");
  await window.locator("#queue-sidebar").getByText(alphaNotice).waitFor();
  expect(await paintedCopies(window, alphaNotice), "one sidebar copy with the queue open").toEqual([
    "sidebar",
  ]);
  expect(await alert.count(), "one alert with the queue open").toBe(1);
  expect(
    await isCurrentAlert(window, alertNode, alphaNotice),
    "opening the queue keeps the same alert node",
  ).toBe(true);

  await toggleQueue("Close queue sidebar");
  await window.locator("#queue-sidebar").getByText(alphaNotice).waitFor({ state: "detached" });
  expect(await paintedCopies(window, alphaNotice), "one page copy after closing the queue").toEqual(
    ["page"],
  );
  expect(await alert.count(), "one alert after closing the queue").toBe(1);
  expect(
    await isCurrentAlert(window, alertNode, alphaNotice),
    "closing the queue keeps the same alert node",
  ).toBe(true);

  await toggleQueue("Open queue sidebar");
  await rename(join(sourceDirectory, "charlie.wav"), join(sourceDirectory, "charlie.moved"));
  await tracks.getByRole("row", { name: /charlie/ }).dblclick();
  await window.locator("#queue-sidebar").getByText(charlieNotice).waitFor();
  expect(
    await paintedCopies(window, charlieNotice),
    "one sidebar copy of a notice that arrives with the queue open",
  ).toEqual(["sidebar"]);
  expect(
    await isCurrentAlert(window, alertNode, charlieNotice),
    "a notice that arrives with the queue open lands in the same alert node",
  ).toBe(true);
});
