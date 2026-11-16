import type { Page } from "playwright";
import { expect, it } from "vite-plus/test";
import { launchWithLibrary } from "./launch";

function trackRow(window: Page, title: string) {
  return window.getByRole("grid", { name: "Tracks" }).getByRole("row", { name: new RegExp(title) });
}

async function openPage(window: Page, link: RegExp, heading: string) {
  await window.getByRole("link", { name: link }).click();
  await window.getByRole("heading", { exact: true, name: heading }).waitFor();
}

it("labels an off folder's tracks, plays them once it is on, and empties Tracks when it is forgotten", async () => {
  const window = await launchWithLibrary("lume-availability-", ["alpha", "bravo"]);
  await trackRow(window, "alpha").waitFor();
  const folderSwitch = window.getByRole("switch", { name: "Enable music" });

  await openPage(window, /^Settings$/, "Folders");
  await folderSwitch.click();
  await expect.poll(() => folderSwitch.getAttribute("aria-checked")).toBe("false");
  await openPage(window, /^Tracks/, "Tracks");
  await trackRow(window, "alpha").getByText("Folder off").waitFor();
  await trackRow(window, "bravo").getByText("Folder off").waitFor();

  await openPage(window, /^Settings$/, "Folders");
  await folderSwitch.click();
  await expect.poll(() => folderSwitch.getAttribute("aria-checked")).toBe("true");
  await openPage(window, /^Tracks/, "Tracks");
  await expect.poll(() => trackRow(window, "alpha").getByText("Folder off").count()).toBe(0);
  await trackRow(window, "alpha").dblclick();
  await window.getByRole("button", { name: "Pause" }).waitFor();
  await expect
    .poll(() => window.evaluate<number>('document.querySelector("audio").currentTime'))
    .toBeGreaterThan(0);

  await openPage(window, /^Settings$/, "Folders");
  await window.getByRole("button", { name: "More options for music" }).click();
  await window.getByRole("menuitem", { name: "Forget folder" }).click();
  await window.getByRole("heading", { name: "No folders" }).waitFor();
  await window.getByRole("link", { name: /^Tracks/ }).click();
  await window.getByRole("heading", { name: "Add your music" }).waitFor();
});
