import { ShortcutKeys } from "@/components/shortcut-keys";
import { DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import {
  type SelectionAction,
  selectionChords,
} from "@/components/track-list/selection/selection-shortcuts";

export function SelectionMenuShortcut({ action }: { action: SelectionAction }) {
  return (
    <DropdownMenuShortcut className="flex shrink-0 items-center pl-2 group-data-highlighted/dropdown-menu-item:text-primary">
      <ShortcutKeys chord={selectionChords[action]} />
    </DropdownMenuShortcut>
  );
}
