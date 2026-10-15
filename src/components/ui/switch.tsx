import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full p-0.5 after:absolute after:-inset-x-1.5 after:-inset-y-3 data-checked:bg-inverse data-unchecked:bg-track data-disabled:cursor-not-allowed data-disabled:opacity-disabled",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-full bg-current motion-safe:group-not-focus-visible/switch:transition-transform motion-safe:group-not-focus-visible/switch:duration-150 motion-safe:group-not-focus-visible/switch:ease-in-out data-checked:translate-x-3 data-checked:text-inverse data-unchecked:text-secondary"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
