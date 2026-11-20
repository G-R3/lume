import {
  ArrowElbowDownLeftIcon,
  ArrowFatUpIcon,
  BackspaceIcon,
  CommandIcon,
  type Icon,
  OptionIcon,
} from "@phosphor-icons/react";
import { keyName, type PlatformChord, resolveChord } from "@/lib/keyboard-shortcuts";

const keyIcons = new Map<string, Icon>([
  ["Backspace", BackspaceIcon],
  ["Enter", ArrowElbowDownLeftIcon],
]);

export function ShortcutKeys({ chord }: { chord: PlatformChord }) {
  const isMac = window.lume.isMac;
  const { key, mod, shift, alt } = resolveChord(chord, isMac);

  if (!isMac) {
    return (
      <span aria-hidden="true">
        {[mod && "Ctrl", shift && "Shift", alt && "Alt", keyName(key)].filter(Boolean).join("+")}
      </span>
    );
  }

  const KeyIcon = keyIcons.get(key);

  return (
    <span aria-hidden="true" className="inline-flex items-center">
      {mod && <CommandIcon className="size-3" weight="bold" />}
      {shift && <ArrowFatUpIcon className="size-3" weight="bold" />}
      {alt && <OptionIcon className="size-3" weight="bold" />}
      {KeyIcon ? <KeyIcon className="size-3" weight="bold" /> : keyName(key)}
    </span>
  );
}
