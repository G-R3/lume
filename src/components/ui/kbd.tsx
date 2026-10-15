import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const kbdVariants = cva(
  "pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded-sm px-1 font-mono text-meta select-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "text-secondary inset-ring inset-ring-strong",
        inverse: "bg-inverse-kbd text-inverse-kbd",
        danger: "bg-danger-kbd text-danger-kbd",
      },
      size: {
        default: "h-4 min-w-4",
        lg: "h-5 min-w-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Kbd({
  className,
  size,
  variant,
  ...props
}: ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd data-slot="kbd" className={cn(kbdVariants({ size, variant }), className)} {...props} />
  );
}

function KbdGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
