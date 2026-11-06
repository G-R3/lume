import { ArrowElbowDownLeftIcon, BackspaceIcon, type Icon } from "@phosphor-icons/react";

export type Chord = {
  readonly key: string;
  readonly keyIcon?: Icon;
  readonly primary?: true;
  readonly shift?: true;
  readonly alt?: true;
};

type SelectionShortcut = {
  readonly mac: Chord;
  readonly other: Chord;
  readonly requires?: keyof SelectionCapabilities;
};

export type SelectionCapabilities = { readonly queue: boolean; readonly playlist: boolean };

const selectionActions = [
  "addToPlaylist",
  "queue",
  "playNext",
  "like",
  "createPlaylist",
  "removeFromPlaylist",
] as const;

export type SelectionAction = (typeof selectionActions)[number];

const selectionShortcuts = {
  addToPlaylist: {
    mac: { key: "p", primary: true, shift: true },
    other: { key: "p", primary: true, shift: true },
  },
  queue: {
    mac: { alt: true, key: "Enter", keyIcon: ArrowElbowDownLeftIcon },
    other: { alt: true, key: "Enter" },
    requires: "queue",
  },
  playNext: {
    mac: { alt: true, shift: true, key: "Enter", keyIcon: ArrowElbowDownLeftIcon },
    other: { alt: true, shift: true, key: "Enter" },
    requires: "queue",
  },
  like: {
    mac: { key: "l", primary: true },
    other: { key: "l", primary: true },
  },
  createPlaylist: {
    mac: { key: "n", primary: true, shift: true },
    other: { key: "n", primary: true, shift: true },
  },
  removeFromPlaylist: {
    mac: { key: "Backspace", keyIcon: BackspaceIcon, primary: true },
    other: { key: "Delete" },
    requires: "playlist",
  },
} satisfies Record<SelectionAction, SelectionShortcut>;

type KeyPress = {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

function shortcutOf(action: SelectionAction): SelectionShortcut {
  return selectionShortcuts[action];
}

export function selectionChord(action: SelectionAction, isMac: boolean) {
  return isMac ? shortcutOf(action).mac : shortcutOf(action).other;
}

export function matchSelectionShortcut(
  event: KeyPress,
  isMac: boolean,
  capabilities: SelectionCapabilities,
) {
  const primary = isMac ? event.metaKey : event.ctrlKey;
  const secondary = isMac ? event.ctrlKey : event.metaKey;

  if (secondary) return null;

  const action = selectionActions.find((candidate) => {
    const chord = selectionChord(candidate, isMac);

    return (
      chord.key.toLowerCase() === event.key.toLowerCase() &&
      Boolean(chord.primary) === primary &&
      Boolean(chord.shift) === event.shiftKey &&
      Boolean(chord.alt) === event.altKey
    );
  });

  if (!action) return null;

  const requirement = shortcutOf(action).requires;

  return requirement && !capabilities[requirement] ? null : action;
}

export function keyName(key: string) {
  return key.length === 1 ? key.toUpperCase() : key;
}

export function selectionKeyShortcuts(action: SelectionAction, isMac: boolean) {
  const chord = selectionChord(action, isMac);

  return [
    chord.primary && (isMac ? "Meta" : "Control"),
    chord.shift && "Shift",
    chord.alt && "Alt",
    keyName(chord.key),
  ]
    .filter(Boolean)
    .join("+");
}
