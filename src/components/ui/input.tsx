import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md bg-sunken px-2.5 text-body text-primary caret-accent inset-ring inset-ring-default placeholder:text-placeholder hover:not-disabled:not-aria-invalid:inset-ring-strong focus-visible:not-aria-invalid:inset-ring-strong aria-invalid:inset-ring-danger disabled:cursor-not-allowed disabled:text-secondary disabled:opacity-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
