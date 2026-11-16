import type { Locator, Page } from "playwright";
import { expect, it } from "vite-plus/test";
import { lumeChannels } from "../shared/lib";
import { holdReplies, launchWithLibrary } from "./launch";

const letters = ["alpha", "bravo", "charlie"];

async function expectStaysOpenWhileSaving(window: Page, dialog: Locator) {
  await expect.poll(() => dialog.getByRole("button", { name: "Cancel" }).isDisabled()).toBe(true);
  await window.keyboard.press("Escape");
  await window.mouse.click(4, 4);
  await window.waitForTimeout(400);
  expect(await dialog.isVisible()).toBe(true);
}

it("keeps the create dialog open while the playlist is being created", async () => {
  const window = await launchWithLibrary("lume-electron-hold-create-", letters);
  const creation = window.getByRole("dialog", { name: /^New playlist/ });

  await window.getByRole("button", { name: "Create playlist" }).click();
  await creation.getByLabel("Title").fill("Road");
  await holdReplies(window, lumeChannels.createPlaylist);
  await window.keyboard.press("Enter");

  await expectStaysOpenWhileSaving(window, creation);
});

it("keeps the delete dialog open while the playlist is being deleted", async () => {
  const window = await launchWithLibrary("lume-electron-hold-delete-", letters, { Mix: ["alpha"] });
  const alert = window.getByRole("alertdialog");

  await window.getByRole("link", { name: "Mix" }).click({ button: "right" });
  await window.getByRole("menuitem", { name: "Delete playlist" }).click();
  await holdReplies(window, lumeChannels.deletePlaylist);
  await alert.getByRole("button", { name: /Delete playlist/ }).click();

  await expectStaysOpenWhileSaving(window, alert);
});

it("keeps the duplicates dialog open while the tracks are being added", async () => {
  const window = await launchWithLibrary("lume-electron-hold-add-", letters, { Mix: ["alpha"] });
  const grid = window.getByRole("grid", { name: "Tracks" });
  const picker = window.getByRole("dialog", { name: "Add to playlist" });
  const alert = window.getByRole("alertdialog");

  await grid.getByRole("row", { name: /\balpha\b/ }).click();
  await window.keyboard.press("Meta+Shift+p");
  await picker.getByRole("option", { name: /Mix/ }).click();
  await alert.waitFor();
  await holdReplies(window, lumeChannels.addTracksToPlaylist);
  await alert.getByRole("button", { name: "Add anyway" }).click();

  await expectStaysOpenWhileSaving(window, alert);
});
