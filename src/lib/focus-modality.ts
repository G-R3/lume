import { isEditableElement } from "@/lib/keyboard-shortcuts";

const modifierKeys: ReadonlySet<string> = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "FnLock",
  "Hyper",
  "Meta",
  "NumLock",
  "ScrollLock",
  "Shift",
  "Super",
  "Symbol",
  "SymbolLock",
]);

// Chromium turns on :focus-visible for any keydown, including Shift alone, and lets programmatic
// focus inherit the ring from a previously focused text field. The focus-visible variant in
// index.css is off while this attribute is set, so the ring follows the last real input instead.
export function trackFocusModality(root = document.documentElement) {
  let lastInput: "keyboard" | "pointer" = "keyboard";

  const update = () => {
    const active = document.activeElement;
    const hidesRing = lastInput === "pointer" && !(active && isEditableElement(active));

    root.toggleAttribute("data-pointer-focus", hidesRing);
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (modifierKeys.has(event.key)) return;

      lastInput = "keyboard";
      update();
    },
    true,
  );

  window.addEventListener(
    "pointerdown",
    () => {
      lastInput = "pointer";
      update();
    },
    true,
  );

  window.addEventListener("focusin", update, true);
}
