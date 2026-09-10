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
    { bindingKey: " ", description: "Space", eventKey: " " },
    { bindingKey: "ArrowRight", description: "ArrowRight", eventKey: "ArrowRight" },
    { bindingKey: "B", description: "letters without case sensitivity", eventKey: "b" },
  ])("matches $description using event.key", (testCase) => {
    let calls = 0;

    const event = dispatchShortcut(
      document.body,
      [{ name: "Test shortcut", key: testCase.bindingKey, action: () => calls++ }],
      { key: testCase.eventKey },
    );

    expect(calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    {
      description: "Command on macOS",
      eventInit: { key: "k", metaKey: true },
      isMac: true,
    },
    {
      description: "Control on other platforms",
      eventInit: { ctrlKey: true, key: "k" },
      isMac: false,
    },
  ])("uses $description as the primary modifier", (testCase) => {
    let calls = 0;

    dispatchShortcut(
      document.body,
      [{ name: "Open search", key: "k", primary: true, action: () => calls++ }],
      testCase.eventInit,
      testCase.isMac,
    );

    expect(calls).toBe(1);
  });

  it.each([
    {
      description: "Control on macOS",
      isMac: true,
      matchingEventInit: { key: "k", metaKey: true },
      unexpectedEventInit: { ctrlKey: true, key: "k" },
    },
    {
      description: "Command on other platforms",
      isMac: false,
      matchingEventInit: { ctrlKey: true, key: "k" },
      unexpectedEventInit: { key: "k", metaKey: true },
    },
    {
      description: "an extra Shift key on macOS",
      isMac: true,
      matchingEventInit: { key: "k", metaKey: true },
      unexpectedEventInit: { key: "k", metaKey: true, shiftKey: true },
    },
    {
      description: "an extra Alt key on other platforms",
      isMac: false,
      matchingEventInit: { ctrlKey: true, key: "k" },
      unexpectedEventInit: { altKey: true, ctrlKey: true, key: "k" },
    },
  ])("rejects $description", (testCase) => {
    let calls = 0;

    const shortcut = {
      name: "Open search",
      key: "k",
      primary: true,
      action: () => calls++,
    };

    const matchingEvent = dispatchShortcut(
      document.body,
      [shortcut],
      testCase.matchingEventInit,
      testCase.isMac,
    );

    const unexpectedEvent = dispatchShortcut(
      document.body,
      [shortcut],
      testCase.unexpectedEventInit,
      testCase.isMac,
    );

    expect(calls).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(unexpectedEvent.defaultPrevented).toBe(false);
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
  it.each([
    { description: "text inputs", tag: "input" },
    { description: "textareas", tag: "textarea" },
    { description: "selects", tag: "select" },
  ])("allows native behavior in $description", (testCase) => {
    let calls = 0;
    const element = document.body.appendChild(document.createElement(testCase.tag));
    const shortcut = { name: "Toggle playback", key: " ", action: () => calls++ };

    const matchingEvent = dispatchShortcut(document.body, [shortcut], { key: " " });
    const editableEvent = dispatchShortcut(element, [shortcut], { key: " " });

    expect(calls).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(editableEvent.defaultPrevented).toBe(false);
  });

  it.each([
    { description: "Space", eventInit: { key: " " }, key: " ", primary: false },
    {
      description: "Command+ArrowLeft",
      eventInit: { key: "ArrowLeft", metaKey: true },
      key: "ArrowLeft",
      primary: true,
    },
    {
      description: "Command+ArrowRight",
      eventInit: { key: "ArrowRight", metaKey: true },
      key: "ArrowRight",
      primary: true,
    },
  ])("handles $description from range inputs", (testCase) => {
    let calls = 0;
    const input = document.body.appendChild(document.createElement("input"));
    input.type = "range";

    const event = dispatchShortcut(
      input,
      [
        {
          name: "Audio shortcut",
          key: testCase.key,
          primary: testCase.primary,
          action: () => calls++,
        },
      ],
      testCase.eventInit,
      true,
    );

    expect(calls).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores repeated events", () => {
    let calls = 0;
    const shortcut = { name: "Toggle playback", key: " ", action: () => calls++ };

    const matchingEvent = dispatchShortcut(document.body, [shortcut], { key: " " });
    const repeatedEvent = dispatchShortcut(document.body, [shortcut], { key: " ", repeat: true });

    expect(calls).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(repeatedEvent.defaultPrevented).toBe(false);
  });

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
    const shortcut = { name: "Toggle playback", key: " ", action: () => calls++ };

    const matchingEvent = dispatchShortcut(document.body, [shortcut], { key: " " });
    const unmatchedEvent = dispatchShortcut(document.body, [shortcut], { key: "Enter" });

    expect(calls).toBe(1);
    expect(matchingEvent.defaultPrevented).toBe(true);
    expect(unmatchedEvent.defaultPrevented).toBe(false);
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
