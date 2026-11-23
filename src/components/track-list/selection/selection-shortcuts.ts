import {
  type Chord,
  type KeyPress,
  matchesChord,
  type PlatformChord,
} from "@/lib/keyboard-shortcuts";

export type SelectionCapabilities = { readonly queue: boolean; readonly playlist: boolean };

export const SELECTION_CHORDS = {
  addToPlaylist: { key: "p", mod: true, shift: true },
  addToQueue: { key: "Enter", alt: true },
  playNext: { key: "Enter", alt: true, shift: true },
  like: { key: "l", mod: true },
  createPlaylist: { key: "n", mod: true, shift: true },
  removeFromPlaylist: { mac: { key: "Backspace", mod: true }, other: { key: "Delete" } },
} satisfies Record<string, PlatformChord>;

export type SelectionAction = keyof typeof SELECTION_CHORDS;

function isSelectionAction(action: string): action is SelectionAction {
  return Object.hasOwn(SELECTION_CHORDS, action);
}

const REQUIRED_CAPABILITY: Partial<Record<SelectionAction, keyof SelectionCapabilities>> = {
  addToQueue: "queue",
  playNext: "queue",
  removeFromPlaylist: "playlist",
};

export const SELECT_ALL_CHORD: Chord = { key: "a", mod: true };

export function matchSelectionShortcut(
  event: KeyPress,
  capabilities: SelectionCapabilities,
  isMac = window.lume.isMac,
) {
  const action = Object.keys(SELECTION_CHORDS)
    .filter(isSelectionAction)
    .find((candidate) => matchesChord(SELECTION_CHORDS[candidate], event, isMac));

  if (!action) return null;

  const requirement = REQUIRED_CAPABILITY[action];

  return requirement && !capabilities[requirement] ? null : action;
}
