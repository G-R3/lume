import { Toast as ToastPrimitive } from "@base-ui/react/toast";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckIcon, XIcon } from "@phosphor-icons/react";

const toastManager = ToastPrimitive.createToastManager();

type ToastManager = typeof toastManager;

// Confirmations toasts are closd after the provider's 5s (hover and focus will pause the timer)
// errors and toasts with actions stay until they are closed
const toast: ToastManager = {
  ...toastManager,
  add: (options) => {
    const isError = options.type === "error";
    const stays = isError || options.actionProps !== undefined;

    return toastManager.add({
      ...(isError && { priority: "high" }),
      ...(stays && { timeout: 0 }),
      ...options,
    });
  },
};

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-4 bottom-4 z-50 w-90 max-w-[calc(100%-2rem)] outline-none",
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full rounded-xl bg-overlay text-primary shadow-toast inset-ring inset-ring-strong select-none [--gap:16px]",
        "[--y:calc(var(--toast-swipe-movement-y)-var(--toast-offset-y)-var(--toast-index)*var(--gap))] [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--y))]",
        "transition-[transform,opacity] duration-300 ease-spring-ui data-limited:opacity-0 data-starting-style:opacity-0 motion-safe:data-starting-style:[transform:translateY(8px)]",
        "data-ending-style:opacity-0 data-ending-style:duration-200 data-ending-style:ease-spring-exit",
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn("flex min-h-10 items-center gap-2 px-3", className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-body text-primary", className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-meta text-secondary", className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button size="default" variant="ghost" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0 rounded-lg px-2", className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  render = <Button size="icon-sm" variant="ghost" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      aria-label="Close"
      data-slot="toast-close"
      render={render}
      className={cn("rounded-md", className)}
      {...props}
    >
      <XIcon aria-hidden="true" className="size-3.5" />
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  if (type === "success") {
    return <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-secondary" />;
  }

  if (type === "error") {
    return <span aria-hidden="true" className="mt-1.25 size-1.5 shrink-0 rounded-full bg-danger" />;
  }

  return null;
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => {
    const hasDescription = Boolean(toastItem.description);
    const closable = toastItem.timeout === 0;

    return (
      <Toast key={toastItem.id} toast={toastItem}>
        <ToastContent className={cn(hasDescription && "items-start py-3", closable && "pr-1")}>
          <ToastIcon type={toastItem.type} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastTitle className={cn(hasDescription && "font-medium")} />
            <ToastDescription />
          </div>
          {toastItem.actionProps && <ToastAction />}
          {closable && <ToastClose className={cn(hasDescription && "-my-1")} />}
        </ToastContent>
      </Toast>
    );
  });
}

function Toaster({
  children,
  toastManager: manager = toast,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={manager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

const createToastManager = ToastPrimitive.createToastManager;

const useToastManager = ToastPrimitive.useToastManager;

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastList,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useToastManager,
};
