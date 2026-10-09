import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const pressScale = "active:not-data-disabled:scale-96";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-transform duration-150 ease-out select-none data-disabled:cursor-default data-disabled:opacity-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-inverse text-inverse hover:not-data-disabled:bg-inverse-hover",
        secondary: "bg-control text-primary hover:not-data-disabled:bg-control-hover",
        ghost:
          "text-secondary hover:not-data-disabled:bg-hover hover:not-data-disabled:text-primary focus-visible:text-primary data-popup-open:bg-selected data-popup-open:text-primary",
        toolbar:
          "text-secondary hover:not-data-disabled:bg-hover hover:not-data-disabled:text-primary focus-visible:text-primary aria-expanded:bg-selected aria-expanded:hover:not-data-disabled:bg-selected aria-pressed:bg-selected aria-pressed:hover:not-data-disabled:bg-selected data-popup-open:bg-selected data-popup-open:text-primary",
        danger: "bg-danger text-inverse hover:not-data-disabled:bg-danger-hover",
      },
      size: {
        // Icon-side padding is the text-side padding minus 2px; a shortcut chip sits 8px from the edge
        default:
          "h-8 gap-1.5 rounded-md px-3 text-body has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 has-data-[slot=kbd]:gap-2 has-data-[slot=kbd]:pr-2",
        sm: "h-6 gap-1.5 rounded-sm px-2 text-meta has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        icon: "size-8 rounded-md",
        "icon-sm": "size-6 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    busy?: boolean;
    /** Turns off the press scale where motion would distract (rows, lists). */
    static?: boolean;
  };

function Button({
  busy = false,
  children,
  className,
  disabled,
  focusableWhenDisabled,
  size = "default",
  static: isStatic = false,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      aria-busy={busy || undefined}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), !isStatic && pressScale, className)}
      disabled={disabled || busy}
      focusableWhenDisabled={focusableWhenDisabled ?? busy}
      {...props}
    >
      {busy && (
        <CircleNotchIcon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
      )}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
