import { useEffect, useRef } from "react";

export type KeyboardShortcut = {
  name: string;
  key: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInEditable?: boolean;
  action: () => void;
};

export function useKeyboardShortcuts(shortcuts: readonly KeyboardShortcut[], isMac: boolean) {
  const handler = createKeyboardShortcutHandler(shortcuts, isMac);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handlerRef.current(event);

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
}

export function createKeyboardShortcutHandler(
  shortcuts: readonly KeyboardShortcut[],
  isMac: boolean,
) {
  const shortcutsBySignature = new Map<string, KeyboardShortcut>();

  shortcuts.forEach((shortcut) => {
    const signature = getShortcutSignature(shortcut, isMac);
    const duplicate = shortcutsBySignature.get(signature);

    if (duplicate) {
      throw new Error(
        `Keyboard shortcut "${shortcut.name}" duplicates "${duplicate.name}" (${formatShortcut(shortcut)})`,
      );
    }

    shortcutsBySignature.set(signature, shortcut);
  });

  return (event: KeyboardEvent) => {
    if (event.repeat || event.isComposing) return;

    const shortcut = shortcutsBySignature.get(
      createSignature(event.key, event.ctrlKey, event.metaKey, event.shiftKey, event.altKey),
    );

    if (!shortcut || (!shortcut.allowInEditable && isEditingEvent(event))) return;

    event.preventDefault();
    shortcut.action();
  };
}

function getShortcutSignature(shortcut: KeyboardShortcut, isMac: boolean) {
  return createSignature(
    shortcut.key,
    Boolean(shortcut.primary && !isMac),
    Boolean(shortcut.primary && isMac),
    Boolean(shortcut.shift),
    Boolean(shortcut.alt),
  );
}

function createSignature(
  key: string,
  control: boolean,
  meta: boolean,
  shift: boolean,
  alt: boolean,
) {
  return `${normalizeKey(key)}:${Number(control)}${Number(meta)}${Number(shift)}${Number(alt)}`;
}

function normalizeKey(key: string) {
  if (key === " ") return "space";
  return key.toLowerCase();
}

function isEditingEvent(event: KeyboardEvent) {
  return event.composedPath().some(
    (target) =>
      target instanceof Element &&
      target.matches(
        // `input:not([type='range'])` allows all range inputs. should maybe make it narrow it to the audio control slider
        // also buttons are hijacked so shortcuts don't trigger when they are focused. Might add to the list here if it doesn't
        // feel right :)
        "input:not([type='range']), textarea, select, [contenteditable]:not([contenteditable='false'])",
      ),
  );
}

function formatShortcut(shortcut: KeyboardShortcut) {
  return [
    shortcut.primary && "Primary",
    shortcut.shift && "Shift",
    shortcut.alt && "Alt",
    shortcut.key === " " ? "Space" : shortcut.key,
  ]
    .filter(Boolean)
    .join("+");
}
