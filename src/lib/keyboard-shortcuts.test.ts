// @vitest-environment happy-dom

import { createElement, StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  selectAllChord,
  selectionChords,
} from "@/components/track-list/selection/selection-shortcuts";
import {
  ariaOf,
  dialogChords,
  type GlobalShortcutId,
  globalShortcuts,
  matches,
  type PlatformChord,
  resolve,
  useKeyboardShortcuts,
} from "./keyboard-shortcuts";

type Actions = Partial<Record<GlobalShortcutId, () => void>>;

let root: Root | null = null;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mountShortcuts(actions: Actions, isMac = false) {
  vi.stubGlobal("lume", { isMac });

  function TestShortcuts() {
    useKeyboardShortcuts(actions);

    return null;
  }

  root = createRoot(document.body.appendChild(document.createElement("div")));
  flushSync(() => root?.render(createElement(StrictMode, null, createElement(TestShortcuts))));
}

function press(target: EventTarget, eventInit: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...eventInit });
  target.dispatchEvent(event);

  return event;
}

function counter() {
  const calls = { count: 0 };

  return [calls, () => calls.count++] as const;
}

describe("global shortcut matching", () => {
  it.each([
    { description: "Space", id: "togglePlayback", eventInit: { key: " " } },
    {
      description: "Command+ArrowRight",
      id: "nextTrack",
      eventInit: { key: "ArrowRight", metaKey: true },
    },
    {
      description: "letters without case sensitivity",
      id: "toggleSidebar",
      eventInit: { key: "B", metaKey: true },
    },
    { description: "slash", id: "focusFilter", eventInit: { key: "/" } },
    {
      description: "Shift+slash on layouts that need it",
      id: "focusFilterWithShift",
      eventInit: { key: "/", shiftKey: true },
    },
  ] as const)("matches $description using event.key", ({ id, eventInit }) => {
    const [calls, action] = counter();
    mountShortcuts({ [id]: action }, true);

    const event = press(document.body, eventInit);

    expect(calls.count).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    {
      description: "Control on macOS",
      isMac: true,
      matchingEventInit: { key: "b", metaKey: true },
      unexpectedEventInit: { ctrlKey: true, key: "b" },
    },
    {
      description: "Command on other platforms",
      isMac: false,
      matchingEventInit: { ctrlKey: true, key: "b" },
      unexpectedEventInit: { key: "b", metaKey: true },
    },
    {
      description: "Control alongside Command on macOS",
      isMac: true,
      matchingEventInit: { key: "b", metaKey: true },
      unexpectedEventInit: { ctrlKey: true, key: "b", metaKey: true },
    },
    {
      description: "Command alongside Control on other platforms",
      isMac: false,
      matchingEventInit: { ctrlKey: true, key: "b" },
      unexpectedEventInit: { ctrlKey: true, key: "b", metaKey: true },
    },
    {
      description: "an extra Shift key on macOS",
      isMac: true,
      matchingEventInit: { key: "b", metaKey: true },
      unexpectedEventInit: { key: "b", metaKey: true, shiftKey: true },
    },
    {
      description: "an extra Alt key on other platforms",
      isMac: false,
      matchingEventInit: { ctrlKey: true, key: "b" },
      unexpectedEventInit: { altKey: true, ctrlKey: true, key: "b" },
    },
  ])("rejects $description", (testCase) => {
    const [calls, action] = counter();
    mountShortcuts({ toggleSidebar: action }, testCase.isMac);

    const matchingEvent = press(document.body, testCase.matchingEventInit);
    const unexpectedEvent = press(document.body, testCase.unexpectedEventInit);

    expect(calls.count).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(unexpectedEvent.defaultPrevented).toBe(false);
  });

  it("ignores chords whose action the caller did not provide", () => {
    const [calls, action] = counter();
    mountShortcuts({ togglePlayback: action });

    const event = press(document.body, { key: "m" });

    expect(calls.count).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("global shortcut event policy", () => {
  it.each(["input", "textarea", "select"])("allows native behavior in a %s", (tag) => {
    const [calls, action] = counter();
    const element = document.body.appendChild(document.createElement(tag));
    mountShortcuts({ togglePlayback: action });

    const matchingEvent = press(document.body, { key: " " });
    const editableEvent = press(element, { key: " " });

    expect(calls.count).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(editableEvent.defaultPrevented).toBe(false);
  });

  it.each([
    { description: "Space", eventInit: { key: " " } },
    { description: "Command+ArrowLeft", eventInit: { key: "ArrowLeft", metaKey: true } },
    { description: "Command+ArrowRight", eventInit: { key: "ArrowRight", metaKey: true } },
  ])("handles $description from range inputs", ({ eventInit }) => {
    const [calls, action] = counter();
    const input = document.body.appendChild(document.createElement("input"));
    input.type = "range";
    mountShortcuts({ togglePlayback: action, previousTrack: action, nextTrack: action }, true);

    const event = press(input, eventInit);

    expect(calls.count).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets a focused button handle Space", () => {
    const [calls, action] = counter();
    const button = document.body.appendChild(document.createElement("button"));
    mountShortcuts({ togglePlayback: action });

    const event = press(button, { key: " " });

    expect(calls.count).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["dialog", "alertdialog", "menu", "listbox"])(
    "yields to an open %s when the shortcut asks to",
    (role) => {
      const [calls, action] = counter();
      const overlay = document.body.appendChild(document.createElement("div"));
      overlay.setAttribute("role", role);
      const item = overlay.appendChild(document.createElement("div"));
      mountShortcuts({ newPlaylist: action }, true);

      const insideEvent = press(item, { key: "n", metaKey: true });
      const outsideEvent = press(document.body, { key: "n", metaKey: true });

      expect(calls.count).toBe(1);
      expect(insideEvent.defaultPrevented).toBe(false);
      expect(outsideEvent.defaultPrevented).toBe(true);
    },
  );

  it("ignores repeated events", () => {
    const [calls, action] = counter();
    mountShortcuts({ togglePlayback: action });

    const matchingEvent = press(document.body, { key: " " });
    const repeatedEvent = press(document.body, { key: " ", repeat: true });

    expect(calls.count).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(repeatedEvent.defaultPrevented).toBe(false);
  });

  it("prevents native behavior before invoking an action", () => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
    let wasPreventedDuringAction = false;
    mountShortcuts({
      togglePlayback: () => {
        wasPreventedDuringAction = event.defaultPrevented;
      },
    });

    document.body.dispatchEvent(event);

    expect(wasPreventedDuringAction).toBe(true);
  });

  it("prevents native behavior when a matched action does nothing", () => {
    mountShortcuts({ nextTrack: () => undefined }, true);

    expect(press(document.body, { key: "ArrowRight", metaKey: true }).defaultPrevented).toBe(true);
  });

  it("leaves unmatched keys untouched", () => {
    const [calls, action] = counter();
    mountShortcuts({ togglePlayback: action });

    const matchingEvent = press(document.body, { key: " " });
    const unmatchedEvent = press(document.body, { key: "Enter" });

    expect(calls.count).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(unmatchedEvent.defaultPrevented).toBe(false);
  });

  it("keeps one listener through Strict Mode and removes it on unmount", () => {
    const [calls, action] = counter();
    mountShortcuts({ togglePlayback: action });

    press(document.body, { key: " " });
    expect(calls.count).toBe(1);

    flushSync(() => root?.unmount());
    root = null;
    press(document.body, { key: " " });
    expect(calls.count).toBe(1);
  });
});

describe("aria-keyshortcuts", () => {
  it.each([
    ["toggle sidebar", globalShortcuts.toggleSidebar.chord, "Meta+B", "Control+B"],
    ["new playlist", globalShortcuts.newPlaylist.chord, "Meta+N", "Control+N"],
    ["delete playlist", dialogChords.confirmDelete, "Meta+Backspace", "Control+Backspace"],
    ["create from search", dialogChords.createFromSearch, "Meta+Enter", "Control+Enter"],
  ] as const)("%s announces %s on macOS and %s elsewhere", (_, chord, mac, other) => {
    expect(ariaOf(chord, true)).toBe(mac);
    expect(ariaOf(chord, false)).toBe(other);
  });
});

function pressOf(chord: PlatformChord, isMac: boolean) {
  const { key, mod = false, shift = false, alt = false } = resolve(chord, isMac);

  return { altKey: alt, ctrlKey: mod && !isMac, key, metaKey: mod && isMac, shiftKey: shift };
}

function clashes(
  left: Record<string, PlatformChord>,
  right: Record<string, PlatformChord>,
  isMac: boolean,
) {
  return Object.entries(left).flatMap(([leftId, leftChord]) =>
    Object.entries(right)
      .filter(
        ([rightId, rightChord]) =>
          (left !== right || leftId !== rightId) &&
          matches(leftChord, pressOf(rightChord, isMac), isMac),
      )
      .map(([rightId]) => `${leftId} = ${rightId}`),
  );
}

const globalChords = Object.fromEntries(
  Object.entries(globalShortcuts).map(([id, shortcut]) => [id, shortcut.chord]),
);

const globalChordsInsideOverlays = Object.fromEntries(
  Object.entries(globalShortcuts)
    .filter(([, shortcut]) => !("yieldToOverlays" in shortcut))
    .map(([id, shortcut]) => [id, shortcut.chord]),
);

describe.each([
  { isMac: true, name: "macOS" },
  { isMac: false, name: "Windows and Linux" },
])("shortcut collisions on $name", ({ isMac }) => {
  it("gives every global shortcut its own chord", () => {
    expect(clashes(globalChords, globalChords, isMac)).toEqual([]);
  });

  it("keeps global shortcuts off the track list chords they would swallow", () => {
    const listChords = { ...selectionChords, selectAll: selectAllChord };

    expect(clashes(globalChords, listChords, isMac)).toEqual([]);
  });

  it("keeps dialog chords off global shortcuts that fire inside dialogs", () => {
    expect(clashes(dialogChords, globalChordsInsideOverlays, isMac)).toEqual([]);
  });
});
