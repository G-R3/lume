// @vitest-environment happy-dom

import { createElement, StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createKeyboardShortcutHandler,
  type KeyboardShortcut,
  useKeyboardShortcuts,
} from "./keyboard-shortcuts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("keyboard shortcut matching", () => {
  it.each([
    [" ", " "],
    ["ArrowRight", "ArrowRight"],
    ["B", "b"],
  ])("matches %s using event.key", (bindingKey, eventKey) => {
    let calls = 0;
    const event = dispatchShortcut(
      document.body,
      [{ name: "Test shortcut", key: bindingKey, action: () => calls++ }],
      { key: eventKey },
    );

    expect(calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    [true, { metaKey: true }],
    [false, { ctrlKey: true }],
  ])("uses the platform primary modifier when isMac is %s", (isMac, modifiers) => {
    let calls = 0;

    dispatchShortcut(
      document.body,
      [{ name: "Open search", key: "k", primary: true, action: () => calls++ }],
      { key: "k", ...modifiers },
      isMac,
    );

    expect(calls).toBe(1);
  });

  it.each([
    [true, { ctrlKey: true }],
    [false, { metaKey: true }],
    [true, { metaKey: true, shiftKey: true }],
    [false, { ctrlKey: true, altKey: true }],
  ])("rejects unexpected modifiers when isMac is %s", (isMac, modifiers) => {
    let calls = 0;
    const event = dispatchShortcut(
      document.body,
      [{ name: "Open search", key: "k", primary: true, action: () => calls++ }],
      { key: "k", ...modifiers },
      isMac,
    );

    expect(calls).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("rejects duplicate bindings", () => {
    expect(() =>
      createKeyboardShortcutHandler(
        [
          { name: "First search", key: "K", primary: true, action: () => undefined },
          { name: "Second search", key: "k", primary: true, action: () => undefined },
        ],
        true,
      ),
    ).toThrow('Keyboard shortcut "Second search" duplicates "First search" (Primary+k)');
  });
});

describe("keyboard shortcut event policy", () => {
  it.each(["input", "textarea", "select"])("allows native behavior in %s elements", (tag) => {
    let calls = 0;
    const element = document.body.appendChild(document.createElement(tag));
    const event = dispatchShortcut(
      element,
      [{ name: "Toggle playback", key: " ", action: () => calls++ }],
      { key: " " },
    );

    expect(calls).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("allows native behavior in descendants of editable content", () => {
    let calls = 0;
    const editable = document.body.appendChild(document.createElement("div"));
    editable.contentEditable = "true";
    const child = editable.appendChild(document.createElement("span"));
    const event = dispatchShortcut(
      child,
      [{ name: "Toggle playback", key: " ", action: () => calls++ }],
      { key: " " },
    );

    expect(calls).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    [" ", false],
    ["ArrowLeft", true],
    ["ArrowRight", true],
  ])("handles %s shortcuts from range inputs", (key, primary) => {
    let calls = 0;
    const input = document.body.appendChild(document.createElement("input"));
    input.type = "range";
    const event = dispatchShortcut(
      input,
      [{ name: "Audio shortcut", key, primary, action: () => calls++ }],
      { key, metaKey: primary },
      true,
    );

    expect(calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("supports shortcuts that opt into editable controls", () => {
    let calls = 0;
    const input = document.body.appendChild(document.createElement("input"));
    const event = dispatchShortcut(
      input,
      [
        {
          name: "Open search",
          key: "k",
          primary: true,
          allowInEditable: true,
          action: () => calls++,
        },
      ],
      { key: "k", metaKey: true },
      true,
    );

    expect(calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([{ repeat: true }, { isComposing: true }])(
    "ignores repeated and composing events",
    (eventState) => {
      let calls = 0;
      const event = dispatchShortcut(
        document.body,
        [{ name: "Toggle playback", key: " ", action: () => calls++ }],
        { key: " ", ...eventState },
      );

      expect(calls).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("prevents native behavior before invoking an action", () => {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    });
    let wasPreventedDuringAction = false;

    dispatchEventWithShortcuts(document.body, event, [
      {
        name: "Toggle playback",
        key: " ",
        action: () => {
          wasPreventedDuringAction = event.defaultPrevented;
        },
      },
    ]);

    expect(wasPreventedDuringAction).toBe(true);
  });

  it("prevents native behavior when a matched action does nothing", () => {
    const event = dispatchShortcut(
      document.body,
      [{ name: "Next track", key: "ArrowRight", primary: true, action: () => undefined }],
      { key: "ArrowRight", metaKey: true },
      true,
    );

    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves unmatched keys untouched", () => {
    let calls = 0;
    const event = dispatchShortcut(
      document.body,
      [{ name: "Toggle playback", key: " ", action: () => calls++ }],
      { key: "Enter" },
    );

    expect(calls).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps one listener through Strict Mode and removes it on unmount", () => {
    let calls = 0;
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    function TestShortcuts() {
      useKeyboardShortcuts([{ name: "Toggle playback", key: " ", action: () => calls++ }], false);
      return null;
    }

    flushSync(() => root.render(createElement(StrictMode, null, createElement(TestShortcuts))));
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }),
    );
    expect(calls).toBe(1);

    flushSync(() => root.unmount());
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }),
    );
    expect(calls).toBe(1);
  });
});

function dispatchShortcut(
  target: EventTarget,
  shortcuts: readonly KeyboardShortcut[],
  eventInit: KeyboardEventInit,
  isMac = false,
) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });

  dispatchEventWithShortcuts(target, event, shortcuts, isMac);
  return event;
}

function dispatchEventWithShortcuts(
  target: EventTarget,
  event: KeyboardEvent,
  shortcuts: readonly KeyboardShortcut[],
  isMac = false,
) {
  const handler = createKeyboardShortcutHandler(shortcuts, isMac);
  window.addEventListener("keydown", handler, { capture: true });
  target.dispatchEvent(event);
  window.removeEventListener("keydown", handler, { capture: true });
}
