import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content block min-h-18 w-full min-w-0 resize-none rounded-md bg-sunken px-2.5 py-2 text-copy text-primary caret-accent inset-ring inset-ring-default placeholder:text-placeholder hover:not-disabled:not-aria-invalid:inset-ring-strong focus-visible:not-aria-invalid:inset-ring-strong aria-invalid:inset-ring-danger disabled:cursor-not-allowed disabled:text-secondary disabled:opacity-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
