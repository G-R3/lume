import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-scrim transition-opacity duration-300 ease-spring-ui data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-200 data-ending-style:ease-spring-exit",
        className,
      )}
      {...props}
    />
  );
}

// Scales from 0.95 and fades in on spring.ui, out on spring.exit; the backdrop fades. Reduced
// motion keeps only the fades. The 1px padding keeps the footer inside the ring (corners 12 − 1).
function DialogContent({
  className,
  container,
  ...props
}: DialogPrimitive.Popup.Props & Pick<DialogPrimitive.Portal.Props, "container">) {
  return (
    <DialogPortal container={container}>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-100 max-w-[calc(100%-2rem)] -translate-1/2 flex-col overflow-clip rounded-xl bg-raised p-px text-primary shadow-dialog inset-ring inset-ring-default outline-none transition-[opacity,scale] duration-300 ease-spring-ui data-starting-style:opacity-0 motion-safe:data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-200 data-ending-style:ease-spring-exit motion-safe:data-ending-style:scale-95",
          className,
        )}
        {...props}
      />
    </DialogPortal>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex flex-col gap-4 px-6 pt-6 pb-4", className)}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex items-center justify-end gap-2 rounded-b-[11px] border-t border-separator bg-inset px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-title font-semibold text-primary", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-copy text-secondary", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
