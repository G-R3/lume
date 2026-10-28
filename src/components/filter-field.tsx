import { FunnelSimpleIcon } from "@phosphor-icons/react";
import {
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

export type FilterFieldHandle = { focus: () => void };

type FilterFieldProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  "onChange" | "ref" | "value"
> & {
  onValueChange: (value: string) => void;
  ref?: Ref<FilterFieldHandle>;
  value: string;
};

const overlaySelector = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

export function FilterField({
  className,
  onBlur,
  onFocus,
  onKeyDown,
  onValueChange,
  ref,
  value,
  ...props
}: FilterFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const focusField = () => {
    if (document.activeElement?.closest(overlaySelector)) return;

    inputRef.current?.focus();
    inputRef.current?.select();
  };

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  // Layouts such as German or French AZERTY type "/" with Shift.
  useKeyboardShortcuts(
    [
      { name: "Focus filter", key: "/", action: focusField },
      { name: "Focus filter with Shift", key: "/", shift: true, action: focusField },
    ],
    window.lume.isMac,
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);

    if (event.key !== "Escape" || event.nativeEvent.isComposing || !value) return;

    event.preventDefault();
    event.stopPropagation();
    onValueChange("");
  };

  return (
    <InputGroup className={cn("bg-raised", className)}>
      <InputGroupInput
        {...props}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={value}
      />
      <InputGroupAddon>
        <FunnelSimpleIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <FilterFieldHint clearsOnEscape={isFocused && value !== ""} />
      </InputGroupAddon>
    </InputGroup>
  );
}

function FilterFieldHint({ clearsOnEscape }: { clearsOnEscape: boolean }) {
  return <Kbd aria-hidden="true">{clearsOnEscape ? "esc" : "/"}</Kbd>;
}
