import {
  type Chord,
  type KeyPress,
  matchesChord,
  type PlatformChord,
} from "@/lib/keyboard-shortcuts";

export type SelectionCapabilities = { readonly queue: boolean; readonly playlist: boolean };

export const selectionChords = {
  addToPlaylist: { key: "p", mod: true, shift: true },
  addToQueue: { key: "Enter", alt: true },
  playNext: { key: "Enter", alt: true, shift: true },
  like: { key: "l", mod: true },
  createPlaylist: { key: "n", mod: true, shift: true },
  removeFromPlaylist: { mac: { key: "Backspace", mod: true }, other: { key: "Delete" } },
} satisfies Record<string, PlatformChord>;

export type SelectionAction = keyof typeof selectionChords;

function isSelectionAction(action: string): action is SelectionAction {
  return Object.hasOwn(selectionChords, action);
}

const requiredCapability: Partial<Record<SelectionAction, keyof SelectionCapabilities>> = {
  addToQueue: "queue",
  playNext: "queue",
  removeFromPlaylist: "playlist",
};

export const selectAllChord: Chord = { key: "a", mod: true };

export function matchSelectionShortcut(
  event: KeyPress,
  capabilities: SelectionCapabilities,
  isMac = window.lume.isMac,
) {
  const action = Object.keys(selectionChords)
    .filter(isSelectionAction)
    .find((candidate) => matchesChord(selectionChords[candidate], event, isMac));

  if (!action) return null;

  const requirement = requiredCapability[action];

  return requirement && !capabilities[requirement] ? null : action;
}
