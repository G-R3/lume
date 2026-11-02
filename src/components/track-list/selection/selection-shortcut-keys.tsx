import { ArrowFatUpIcon, CommandIcon, OptionIcon } from "@phosphor-icons/react";
import { DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import {
  keyName,
  type SelectionAction,
  selectionChord,
} from "@/components/track-list/selection/selection-shortcuts";

export function SelectionShortcutKeys({ action }: { action: SelectionAction }) {
  const isMac = window.lume.isMac;
  const chord = selectionChord(action, isMac);

  if (!isMac) {
    return [chord.primary && "Ctrl", chord.shift && "Shift", chord.alt && "Alt", keyName(chord.key)]
      .filter(Boolean)
      .join("+");
  }

  const KeyIcon = chord.keyIcon;

  return (
    <>
      {chord.primary && <CommandIcon className="size-3" weight="bold" />}
      {chord.shift && <ArrowFatUpIcon className="size-3" weight="bold" />}
      {chord.alt && <OptionIcon className="size-3" weight="bold" />}
      {KeyIcon ? <KeyIcon className="size-3" weight="bold" /> : keyName(chord.key)}
    </>
  );
}

export function SelectionMenuShortcut({ action }: { action: SelectionAction }) {
  return (
    <DropdownMenuShortcut
      aria-hidden="true"
      className="flex shrink-0 items-center pl-2 group-data-highlighted/dropdown-menu-item:text-primary"
    >
      <SelectionShortcutKeys action={action} />
    </DropdownMenuShortcut>
  );
}
