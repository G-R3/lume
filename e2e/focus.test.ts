import type { Locator, Page } from "playwright";
import { expect, it } from "vite-plus/test";
import { launchWithLibrary } from "./launch";

const letters = ["alpha", "bravo", "charlie", "delta", "echo"];

function trackGrid(window: Page, name = "Tracks") {
  const grid = window.getByRole("grid", { name });
  const row = (title: string) => grid.getByRole("row", { name: new RegExp(`\\b${title}\\b`) });

  const focusedRowTitle = async () => {
    const focused = grid.locator("tr[data-entry-id]:focus");

    return (await focused.count()) === 0 ? null : focused.locator("p").first().textContent();
  };

  return { focusedRowTitle, grid, row };
}

async function focusedName(window: Page) {
  const focused = window.locator(":focus");

  if ((await focused.count()) === 0) return null;

  return (await focused.getAttribute("aria-label")) ?? (await focused.textContent())?.trim();
}

async function isFocused(locator: Locator) {
  return (await locator.and(locator.page().locator(":focus")).count()) === 1;
}

it("moves the track selection with the keyboard and plays it with Enter", async () => {
  const titles = Array.from(
    { length: 60 },
    (_, index) => `track ${String(index + 1).padStart(2, "0")}`,
  );

  const window = await launchWithLibrary("lume-electron-keys-", titles);
  const grid = window.getByRole("grid", { name: "Tracks" });
  await grid.locator("tr[data-entry-id]").first().waitFor();

  const focusedRow = grid.locator("tr[data-entry-id]:focus");

  const focusedRowIndex = async () =>
    Number(await focusedRow.getAttribute("aria-rowindex", { timeout: 1_000 }));

  const expectFocusedRow = async (rowIndex: number) => {
    await expect.poll(focusedRowIndex).toBe(rowIndex);
    expect(await focusedRow.getAttribute("aria-selected")).toBe("true");
  };

  await grid.locator('tr[aria-rowindex="3"]').click();
  await expectFocusedRow(3);
  await window.keyboard.press("ArrowDown");
  await expectFocusedRow(4);
  await window.keyboard.press("ArrowUp");
  await expectFocusedRow(3);
  await window.keyboard.press("End");
  await expectFocusedRow(61);
  await window.keyboard.press("PageUp");
  await expect.poll(focusedRowIndex).toBeLessThan(60);
  await window.keyboard.press("Home");
  await expectFocusedRow(2);
  await window.keyboard.press("PageDown");
  await expect.poll(focusedRowIndex).toBeGreaterThan(3);
  await window.keyboard.press("Home");
  await expectFocusedRow(2);

  const firstRow = grid.locator('tr[aria-rowindex="2"]');
  const firstTitle = (await firstRow.locator("p").first().textContent()) ?? "";
  await firstRow.click({ button: "right" });
  await window.getByRole("menu").waitFor();
  await window.keyboard.press("ArrowDown");
  await window.keyboard.press("End");
  await window.keyboard.press("Escape");
  await window.getByRole("menu").waitFor({ state: "detached" });
  expect(await grid.locator('tr[aria-selected="true"]').getAttribute("aria-rowindex")).toBe("2");

  await grid.getByRole("button", { exact: true, name: `Like ${firstTitle}` }).focus();
  await window.keyboard.press("Enter");
  await grid.getByRole("button", { exact: true, name: `Unlike ${firstTitle}` }).waitFor();
  expect(await window.getByRole("button", { name: "Pause" }).count()).toBe(0);
  expect(await grid.locator('tr[aria-selected="true"]').getAttribute("aria-rowindex")).toBe("2");

  await firstRow.focus();
  await window.keyboard.press("Enter");
  await window.getByRole("button", { name: "Pause" }).waitFor();
  expect(await firstRow.getAttribute("aria-current")).toBe("true");
});

it("returns focus to the row whose menu opened last while an earlier menu is still closing", async () => {
  const window = await launchWithLibrary("lume-electron-menu-focus-", letters);
  const { grid, row } = trackGrid(window);
  const focusedRow = grid.locator("tr[data-entry-id]:focus-within");

  const focusedTitle = async () =>
    (await focusedRow.count()) === 0 ? null : focusedRow.locator("p").first().textContent();

  await row("echo").waitFor();

  for (let attempt = 0; attempt < 5; attempt++) {
    await row("alpha").click();
    await row("bravo").click({ modifiers: ["Shift"] });
    await row("alpha").click({ button: "right" });
    await window.getByRole("menuitem", { name: /^(Like|Unlike)$/ }).click();
    await row("charlie").click();
    await window.keyboard.press("Meta+a");
    await window.keyboard.press("Shift+F10");
    await window.getByRole("menu").getByRole("menuitem", { name: "Add to playlist" }).waitFor();
    await window.waitForTimeout(400);
    expect(await focusedTitle()).not.toBe("alpha");
    await window.keyboard.press("Escape");
    await window.getByRole("menu").waitFor({ state: "detached" });
    expect(await focusedTitle()).toBe("charlie");
  }
});

it("returns focus to the row after a menu closes from the keyboard but not after an outside press", async () => {
  const window = await launchWithLibrary("lume-electron-menu-close-", letters);
  const { focusedRowTitle, row } = trackGrid(window);
  await row("echo").waitFor();

  await row("bravo").click();
  await window.keyboard.press("Shift+F10");
  await window.getByRole("menu").waitFor();
  await window.keyboard.press("Escape");
  await window.getByRole("menu").waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Shift+F10");
  await window.getByRole("menuitem", { name: "Like" }).click();
  await window.getByRole("menu").waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Shift+F10");
  await window.getByRole("menu").waitFor();
  const filter = window.getByPlaceholder("Filter tracks");
  const box = await filter.boundingBox();
  const pressFilter = () => window.mouse.click((box?.x ?? 0) + 20, (box?.y ?? 0) + 10);
  await pressFilter();
  await window.getByRole("menu").waitFor({ state: "detached" });
  await window.waitForTimeout(300);
  expect(await focusedRowTitle()).toBe(null);
  await pressFilter();
  await window.waitForTimeout(300);
  expect(await isFocused(filter)).toBe(true);
});

it("keeps focus on a surviving row when rows leave the view", async () => {
  const window = await launchWithLibrary("lume-electron-removal-", letters, { Mix: letters });
  await window.getByRole("link", { name: "Mix" }).click();
  const { focusedRowTitle, row } = trackGrid(window, "Mix");
  await row("echo").waitFor();

  await row("bravo").click();
  await window.keyboard.press("Meta+Backspace");
  await row("bravo").waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("charlie");

  await window.keyboard.press("End");
  await expect.poll(focusedRowTitle).toBe("echo");
  await window.keyboard.press("Meta+Backspace");
  await row("echo").waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("delta");

  await window.getByPlaceholder("Filter tracks").fill("alpha");
  await row("charlie").waitFor({ state: "detached" });
  expect(await isFocused(window.getByPlaceholder("Filter tracks"))).toBe(true);
});

it("moves focus from the selection toolbar back to the row when the toolbar leaves", async () => {
  const window = await launchWithLibrary("lume-electron-toolbar-", letters);
  const { focusedRowTitle, row } = trackGrid(window);
  const toolbar = window.getByRole("toolbar");
  await row("echo").waitFor();

  await row("alpha").click();
  await window.keyboard.press("Shift+ArrowDown");
  await toolbar.waitFor();
  await expect.poll(focusedRowTitle).toBe("bravo");

  await toolbar.getByRole("button", { name: "Clear selection" }).focus();
  await window.keyboard.press("Enter");
  await toolbar.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Shift+ArrowDown");
  await toolbar.waitFor();
  await toolbar.getByRole("button", { name: "Clear selection" }).focus();
  await window.keyboard.press("Escape");
  await toolbar.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("charlie");

  await window.keyboard.press("Shift+ArrowUp");
  await toolbar.waitFor();
  await window.getByPlaceholder("Filter tracks").click();
  await window.keyboard.press("Escape");
  await row("alpha").click();
  await toolbar.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("alpha");
});

it("returns focus to where a playlist dialog was opened from", async () => {
  const window = await launchWithLibrary("lume-electron-dialogs-", letters, { Mix: ["alpha"] });
  const { focusedRowTitle, row } = trackGrid(window);
  const dialog = window.getByRole("dialog", { name: "Add to playlist" });
  const creation = window.getByRole("dialog", { name: /^New playlist/ });
  await row("echo").waitFor();

  await row("bravo").click();
  await window.keyboard.press("Shift+F10");
  await window.getByRole("menuitem", { name: "Add to playlist" }).click();
  await dialog.waitFor();
  await window.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Meta+Shift+p");
  await dialog.waitFor();
  await dialog.getByRole("option", { name: /Mix/ }).click();
  await dialog.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Meta+Shift+p");
  await dialog.getByRole("option", { name: /New playlist/ }).click();
  await creation.getByLabel("Title").waitFor();
  await window.keyboard.press("Escape");
  await creation.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Shift+F10");
  await window.getByRole("menuitem", { name: "New playlist" }).click();
  await creation.getByLabel("Title").waitFor();
  await window.keyboard.press("Escape");
  await creation.waitFor({ state: "detached" });
  await expect.poll(focusedRowTitle).toBe("bravo");

  await window.keyboard.press("Shift+ArrowDown");
  const addButton = window.getByRole("toolbar").locator('[data-bar-action="addToPlaylist"]');
  await addButton.click();
  await dialog.waitFor();
  await window.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await expect.poll(() => isFocused(addButton)).toBe(true);

  await window.keyboard.press("Meta+Shift+p");
  await dialog.waitFor();
  await dialog.getByRole("option", { name: /Mix/ }).click();
  await window.getByRole("alertdialog").waitFor();
  await window.keyboard.press("Escape");
  await window.getByRole("alertdialog").waitFor({ state: "detached" });
  await expect.poll(() => isFocused(addButton)).toBe(true);
});

it("moves focus to a surviving control after a playlist is deleted", async () => {
  const window = await launchWithLibrary("lume-electron-delete-", letters, {
    One: ["alpha"],
    Two: ["bravo"],
  });

  const alert = window.getByRole("alertdialog");

  await window.getByRole("link", { name: "Two" }).click();
  await window.getByRole("heading", { level: 1, name: "Two" }).last().waitFor();
  const headerMenu = window.locator("header").getByRole("button", { name: "More options for Two" });
  await headerMenu.click();
  await window.getByRole("menuitem", { name: "Delete playlist" }).click();
  await alert.waitFor();
  await window.keyboard.press("Escape");
  await alert.waitFor({ state: "detached" });
  await expect.poll(() => focusedName(window)).toBe("More options for Two");

  await headerMenu.click();
  await window.getByRole("menuitem", { name: "Delete playlist" }).click();
  await alert.getByRole("button", { name: /Delete playlist/ }).click();
  await window.getByRole("heading", { exact: true, name: "Tracks" }).waitFor();
  await expect.poll(() => focusedName(window)).toBe("Tracks");

  await window.getByRole("link", { name: "One" }).click({ button: "right" });
  await window.getByRole("menuitem", { name: "Delete playlist" }).click();
  await alert.getByRole("button", { name: /Delete playlist/ }).click();
  await window.getByRole("link", { name: "One" }).waitFor({ state: "detached" });
  await expect.poll(() => focusedName(window)).toBe("Create playlist");
});

it("moves focus to a surviving queue control after removing or clearing", async () => {
  const window = await launchWithLibrary("lume-electron-queue-", letters);
  const { row } = trackGrid(window);
  await row("echo").waitFor();
  await row("alpha").dblclick();
  await window.getByRole("button", { name: "Pause" }).waitFor();
  await window.getByRole("button", { name: "Open queue sidebar" }).click();
  const queue = window.getByRole("complementary", { name: "Playback queue" });

  await queue.getByRole("button", { name: "More options for bravo" }).click();
  await window.getByRole("menuitem", { name: /Remove from queue/ }).click();
  await queue.getByRole("button", { name: "Play bravo now" }).waitFor({ state: "detached" });
  await expect.poll(() => focusedName(window)).toBe("Play charlie now");

  await row("echo").click();
  await window.keyboard.press("Alt+Enter");
  await queue.getByRole("button", { name: "Clear manual queue" }).click();
  await expect.poll(() => focusedName(window)).toBe("Next from All tracks");
  await expect.poll(() => queue.getByRole("status").textContent()).toBe("Manual queue cleared");
});
