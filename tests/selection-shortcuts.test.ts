import { describe, expect, it } from "vite-plus/test";
import {
  matchSelectionShortcut,
  type SelectionCapabilities,
  selectionKeyShortcuts,
} from "../src/components/track-list/selection/selection-shortcuts";

type Press = { key: string; alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean };

const everywhere: SelectionCapabilities = { playlist: true, queue: true };

function press({ key, alt = false, ctrl = false, meta = false, shift = false }: Press) {
  return { altKey: alt, ctrlKey: ctrl, key, metaKey: meta, shiftKey: shift };
}

const platforms = [
  {
    isMac: true,
    name: "macOS",
    presses: {
      addToPlaylist: { key: "P", meta: true, shift: true },
      createPlaylist: { key: "N", meta: true, shift: true },
      like: { key: "l", meta: true },
      queue: { alt: true, key: "Enter" },
      playNext: { alt: true, key: "Enter", shift: true },
      removeFromPlaylist: { key: "Backspace", meta: true },
    },
  },
  {
    isMac: false,
    name: "Windows and Linux",
    presses: {
      addToPlaylist: { ctrl: true, key: "P", shift: true },
      createPlaylist: { ctrl: true, key: "N", shift: true },
      like: { ctrl: true, key: "l" },
      queue: { alt: true, key: "Enter" },
      playNext: { alt: true, key: "Enter", shift: true },
      removeFromPlaylist: { key: "Delete" },
    },
  },
] as const;

describe.each(platforms)("selection shortcuts on $name", ({ isMac, presses }) => {
  it.each(Object.entries(presses))("%s matches its chord", (action, chord) => {
    expect(matchSelectionShortcut(press(chord), isMac, everywhere)).toBe(action);
  });
});

describe("neighbors of a selection shortcut", () => {
  it.each<[string, Press]>([
    ["plain Enter", { key: "Enter" }],
    ["Shift+Enter", { key: "Enter", shift: true }],
    ["Cmd+Alt+Shift+Enter", { alt: true, key: "Enter", meta: true, shift: true }],
    ["Cmd+Enter", { key: "Enter", meta: true }],
    ["Cmd+P", { key: "p", meta: true }],
    ["Cmd+Alt+Shift+P", { alt: true, key: "P", meta: true, shift: true }],
    ["Ctrl+Cmd+Shift+P", { ctrl: true, key: "P", meta: true, shift: true }],
    ["Ctrl+L", { ctrl: true, key: "l" }],
    ["Cmd+Shift+L", { key: "L", meta: true, shift: true }],
    ["Cmd+N", { key: "n", meta: true }],
    ["plain Backspace", { key: "Backspace" }],
    ["Delete", { key: "Delete" }],
    ["Cmd+Shift+Backspace", { key: "Backspace", meta: true, shift: true }],
    ["plain L", { key: "l" }],
  ])("%s does nothing on macOS", (_, chord) => {
    expect(matchSelectionShortcut(press(chord), true, everywhere)).toBeNull();
  });

  it.each<[string, Press]>([
    ["plain Enter", { key: "Enter" }],
    ["Ctrl+Enter", { ctrl: true, key: "Enter" }],
    ["Ctrl+P", { ctrl: true, key: "p" }],
    ["Meta+Ctrl+Shift+P", { ctrl: true, key: "P", meta: true, shift: true }],
    ["Meta+L", { key: "l", meta: true }],
    ["Ctrl+Backspace", { ctrl: true, key: "Backspace" }],
    ["Ctrl+Delete", { ctrl: true, key: "Delete" }],
    ["Shift+Delete", { key: "Delete", shift: true }],
    ["plain Backspace", { key: "Backspace" }],
  ])("%s does nothing on Windows and Linux", (_, chord) => {
    expect(matchSelectionShortcut(press(chord), false, everywhere)).toBeNull();
  });
});

describe("shortcuts for unavailable actions", () => {
  it.each([true, false])(
    "ignores Alt+Enter and Shift+Alt+Enter when nothing is playing, isMac=%s",
    (isMac) => {
      const noQueue = { playlist: true, queue: false };

      expect(matchSelectionShortcut(press({ alt: true, key: "Enter" }), isMac, noQueue)).toBeNull();
      expect(
        matchSelectionShortcut(press({ alt: true, key: "Enter", shift: true }), isMac, noQueue),
      ).toBeNull();
      expect(matchSelectionShortcut(press({ key: "l", meta: true }), true, noQueue)).toBe("like");
    },
  );

  it("ignores remove outside a playlist", () => {
    const tracksView = { playlist: false, queue: true };

    expect(
      matchSelectionShortcut(press({ key: "Backspace", meta: true }), true, tracksView),
    ).toBeNull();
    expect(matchSelectionShortcut(press({ key: "Delete" }), false, tracksView)).toBeNull();
  });
});

describe("aria-keyshortcuts", () => {
  it.each([
    ["addToPlaylist", "Meta+Shift+P", "Control+Shift+P"],
    ["queue", "Alt+Enter", "Alt+Enter"],
    ["playNext", "Shift+Alt+Enter", "Shift+Alt+Enter"],
    ["like", "Meta+L", "Control+L"],
    ["createPlaylist", "Meta+Shift+N", "Control+Shift+N"],
    ["removeFromPlaylist", "Meta+Backspace", "Delete"],
  ] as const)("%s announces %s on macOS and %s elsewhere", (action, mac, other) => {
    expect(selectionKeyShortcuts(action, true)).toBe(mac);
    expect(selectionKeyShortcuts(action, false)).toBe(other);
  });
});
