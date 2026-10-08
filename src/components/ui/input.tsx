import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-lg border border-default px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-primary placeholder:text-secondary focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 md:text-xs/relaxed bg-raised aria-invalid:border-danger/50 aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
