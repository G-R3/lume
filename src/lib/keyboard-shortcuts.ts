import { useEffect, useRef } from "react";

export type Chord = {
  readonly key: string;
  readonly mod?: true;
  readonly shift?: true;
  readonly alt?: true;
};

export type PlatformChord = Chord | { readonly mac: Chord; readonly other: Chord };

export type KeyPress = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

type GlobalShortcut = {
  readonly chord: PlatformChord;
  readonly allowInEditable?: true;
  readonly yieldToButtons?: true;
  readonly yieldToOverlays?: true;
};

export const GLOBAL_SHORTCUTS = {
  togglePlayback: { chord: { key: " " }, yieldToButtons: true },
  nextTrack: { chord: { key: "ArrowRight", mod: true } },
  previousTrack: { chord: { key: "ArrowLeft", mod: true } },
  toggleSidebar: { chord: { key: "b", mod: true } },
  newPlaylist: { chord: { key: "n", mod: true }, yieldToOverlays: true },
  toggleMute: { chord: { key: "m" } },
  toggleQueue: { chord: { key: "q" } },
  focusFilter: { chord: { key: "/" }, yieldToOverlays: true },
  // Layouts such as German or French AZERTY type "/" with Shift.
  focusFilterWithShift: { chord: { key: "/", shift: true }, yieldToOverlays: true },
} satisfies Record<string, GlobalShortcut>;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;

function isGlobalShortcutId(id: string): id is GlobalShortcutId {
  return Object.hasOwn(GLOBAL_SHORTCUTS, id);
}

export const DIALOG_CHORDS = {
  confirmDelete: { key: "Backspace", mod: true },
  createFromSearch: { key: "Enter", mod: true },
  submitDescription: { key: "Enter", mod: true },
} satisfies Record<string, Chord>;

export function resolveChord(chord: PlatformChord, isMac = window.lume.isMac): Chord {
  if (!("mac" in chord)) return chord;

  return isMac ? chord.mac : chord.other;
}

export function matchesChord(chord: PlatformChord, event: KeyPress, isMac = window.lume.isMac) {
  const { key, mod, shift, alt } = resolveChord(chord, isMac);

  return (
    key.toLowerCase() === event.key.toLowerCase() &&
    Boolean(mod) === (isMac ? event.metaKey : event.ctrlKey) &&
    !(isMac ? event.ctrlKey : event.metaKey) &&
    Boolean(shift) === event.shiftKey &&
    Boolean(alt) === event.altKey
  );
}

export function keyName(key: string) {
  return key.length === 1 ? key.toUpperCase() : key;
}

export function ariaKeyShortcuts(chord: PlatformChord, isMac = window.lume.isMac) {
  const { key, mod, shift, alt } = resolveChord(chord, isMac);

  return [mod && (isMac ? "Meta" : "Control"), shift && "Shift", alt && "Alt", keyName(key)]
    .filter(Boolean)
    .join("+");
}

const EDITABLE_SELECTOR =
  "input:not([type='range']), textarea, select, [contenteditable]:not([contenteditable='false'])";

const BUTTON_SELECTOR = "button, [role='button']";

const OVERLAY_SELECTOR = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

export function isEditableElement(element: Element) {
  return element.closest(EDITABLE_SELECTOR) !== null;
}

export function isInOverlay(element: Element) {
  return element.closest(OVERLAY_SELECTOR) !== null;
}

function isEligible(shortcut: GlobalShortcut, target: EventTarget | null) {
  if (!(target instanceof Element)) return true;

  return !(
    (!shortcut.allowInEditable && isEditableElement(target)) ||
    (shortcut.yieldToButtons && target.closest(BUTTON_SELECTOR)) ||
    (shortcut.yieldToOverlays && isInOverlay(target))
  );
}

export function useGlobalShortcuts(actions: Partial<Record<GlobalShortcutId, () => void>>) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;

      for (const id of Object.keys(actionsRef.current).filter(isGlobalShortcutId)) {
        const shortcut: GlobalShortcut = GLOBAL_SHORTCUTS[id];
        const action = actionsRef.current[id];

        if (
          !action ||
          !matchesChord(shortcut.chord, event) ||
          !isEligible(shortcut, event.target)
        ) {
          continue;
        }

        event.preventDefault();
        action();

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
}
