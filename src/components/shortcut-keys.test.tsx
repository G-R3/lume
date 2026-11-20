// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ShortcutKeys } from "@/components/shortcut-keys";
import { selectionChords } from "@/components/track-list/selection/selection-shortcuts";
import { dialogChords, globalShortcuts, type PlatformChord } from "@/lib/keyboard-shortcuts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(chord: PlatformChord, isMac: boolean) {
  vi.stubGlobal("lume", { isMac });
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ShortcutKeys chord={chord} />);

  const keys = container.firstElementChild;

  if (!keys) throw new Error("ShortcutKeys rendered nothing");

  return keys;
}

describe("shortcut labels on Windows and Linux", () => {
  it.each([
    ["toggle sidebar", globalShortcuts.toggleSidebar.chord, "Ctrl+B"],
    ["delete playlist", dialogChords.confirmDelete, "Ctrl+Backspace"],
    ["create from search", dialogChords.createFromSearch, "Ctrl+Enter"],
    ["add to playlist", selectionChords.addToPlaylist, "Ctrl+Shift+P"],
    ["play next", selectionChords.playNext, "Shift+Alt+Enter"],
    ["remove from playlist", selectionChords.removeFromPlaylist, "Delete"],
  ] as const)("%s reads %s", (_, chord, label) => {
    const keys = render(chord, false);

    expect(keys.textContent).toBe(label);
    expect(keys.querySelector("svg")).toBeNull();
    expect(keys.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("shortcut labels on macOS", () => {
  it.each([
    ["toggle sidebar", globalShortcuts.toggleSidebar.chord, 1, "B"],
    ["delete playlist", dialogChords.confirmDelete, 2, ""],
    ["add to playlist", selectionChords.addToPlaylist, 2, "P"],
    ["play next", selectionChords.playNext, 3, ""],
  ] as const)("%s draws %i symbols and the text %j", (_, chord, symbols, text) => {
    const keys = render(chord, true);

    expect(keys.querySelectorAll("svg")).toHaveLength(symbols);
    expect(keys.textContent).toBe(text);
    expect(keys.getAttribute("aria-hidden")).toBe("true");
  });
});
