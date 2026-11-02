import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import {
  DotsThreeIcon,
  HeartBreakIcon,
  HeartIcon,
  ListPlusIcon,
  MinusCircleIcon,
  PlaylistIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration } from "@/lib/format-duration";
import { duration as motionDuration, ease, spring } from "@/lib/motion";
import {
  SelectionMenuShortcut,
  SelectionShortcutKeys,
} from "@/pages/tracks/selection-shortcut-keys";
import { type SelectionAction, selectionKeyShortcuts } from "@/pages/tracks/selection-shortcuts";

type SelectionBarProps = {
  allLiked: boolean;
  canAddToQueue: boolean;
  canRemove: boolean;
  count: number;
  duration: number;
  onAction: (action: SelectionAction) => void;
  onClear: () => void;
};

type BarMotion = "instant" | "spring" | "reduced";

const barFadeVariants: Variants = {
  hidden: (mode: BarMotion) => ({
    opacity: 0,
    transition:
      mode === "instant"
        ? { duration: 0 }
        : mode === "reduced"
          ? { duration: motionDuration.exit, ease: ease.out }
          : spring.exit,
  }),
  shown: (mode: BarMotion) => ({
    opacity: 1,
    transition:
      mode === "instant"
        ? { duration: 0 }
        : mode === "reduced"
          ? { duration: 0.14, ease: ease.out }
          : spring.ui,
  }),
};

const barRiseVariants: Variants = {
  hidden: (mode: BarMotion) =>
    mode === "spring"
      ? { scale: 0.975, transition: spring.exit, y: 8 }
      : { scale: 1, transition: { duration: 0 }, y: 0 },
  shown: (mode: BarMotion) => ({
    scale: 1,
    transition: mode === "spring" ? spring.ui : { duration: 0 },
    y: 0,
  }),
};

export function FloatingSelectionBar({
  lastInput,
  shown,
  ...barProps
}: SelectionBarProps & { lastInput: "keyboard" | "pointer"; shown: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  const barMotion: BarMotion =
    lastInput === "keyboard" ? "instant" : prefersReducedMotion ? "reduced" : "spring";

  const [toastLiftWhileShown, setToastLiftWhileShown] = useState<number | null>(null);
  const toastLift = shown ? toastLiftWhileShown : null;

  useLayoutEffect(() => {
    if (toastLift === null) return;

    const root = document.documentElement;

    root.style.setProperty("--toast-lift", `${toastLift}px`);
    root.dataset.toastsLifted = "";

    return () => {
      root.style.removeProperty("--toast-lift");
      delete root.dataset.toastsLifted;
    };
  }, [toastLift]);

  const observeBar = (bar: HTMLDivElement | null) => {
    if (!bar) return;

    const measure = () => setToastLiftWhileShown(toastLiftFor(bar));
    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(bar);

    if (bar.offsetParent) observer.observe(bar.offsetParent);

    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  };

  return (
    <AnimatePresence custom={barMotion}>
      {shown && (
        <motion.div
          animate="shown"
          className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center"
          custom={barMotion}
          data-selection-bar
          exit="hidden"
          initial={barMotion === "instant" ? false : "hidden"}
          key="selection-bar"
          variants={barFadeVariants}
        >
          <motion.div
            className="pointer-events-auto origin-bottom"
            custom={barMotion}
            ref={observeBar}
            variants={barRiseVariants}
          >
            <SelectionBar {...barProps} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Layout offsets, not the bar's rect, so the rise animation's transform never skews the measurement.
function toastLiftFor(bar: HTMLElement) {
  const lane = bar.offsetParent;
  const toasts = document.querySelector("[data-slot='toast-viewport']")?.getBoundingClientRect();

  if (!lane || !toasts) return null;

  const laneBox = lane.getBoundingClientRect();
  const left = laneBox.left + bar.offsetLeft;
  const collides = left < toasts.right && left + bar.offsetWidth > toasts.left;

  // The toast viewport already sits 16px above the window bottom, so lifting it by the bar's
  // top above that edge leaves the same 16px between the toasts and the bar.
  return collides ? window.innerHeight - (laneBox.top + bar.offsetTop) : null;
}

function SelectionBar({
  allLiked,
  canAddToQueue,
  canRemove,
  count,
  duration,
  onAction,
  onClear,
}: SelectionBarProps) {
  const countLabel = `${count.toLocaleString()} selected`;

  return (
    <TooltipProvider delay={500}>
      <div
        aria-label={countLabel}
        className="flex items-center gap-0.5 rounded-xl bg-overlay p-1 shadow-menu inset-ring inset-ring-strong surface-overlay"
        onKeyDown={moveFocusWithArrows}
        role="toolbar"
      >
        <div className="flex h-8 min-w-34 items-center gap-2 pr-2.5 pl-3 tabular-nums">
          <span className="text-body font-medium text-primary">{countLabel}</span>
          <span className="font-mono text-meta text-secondary">{formatDuration(duration)}</span>
        </div>
        <div
          aria-orientation="vertical"
          className="h-4 w-px shrink-0 bg-separator"
          role="separator"
        />
        <BarAction
          action="addToPlaylist"
          label="Add to playlist…"
          render={
            <Button
              className="rounded-lg px-2 text-primary hover:not-data-disabled:text-primary has-data-[icon=inline-start]:pl-2 focus-visible:-outline-offset-2 [&_svg]:text-secondary"
              onClick={() => onAction("addToPlaylist")}
              variant="ghost"
            />
          }
        >
          <PlaylistIcon aria-hidden="true" data-icon="inline-start" />
          Add to playlist…
        </BarAction>
        {canAddToQueue && (
          <BarAction
            action="queue"
            label="Add to queue"
            render={
              <Button
                className="rounded-lg px-2 text-primary hover:not-data-disabled:text-primary has-data-[icon=inline-start]:pl-2 focus-visible:-outline-offset-2 [&_svg]:text-secondary"
                onClick={() => onAction("queue")}
                variant="ghost"
              />
            }
          >
            <ListPlusIcon aria-hidden="true" data-icon="inline-start" />
            Add to queue
          </BarAction>
        )}
        <BarAction
          action="like"
          label={allLiked ? "Unlike" : "Like"}
          render={
            <Button
              className="rounded-lg px-2 text-primary hover:not-data-disabled:text-primary has-data-[icon=inline-start]:pl-2 focus-visible:-outline-offset-2 [&_svg]:text-secondary"
              onClick={() => onAction("like")}
              variant="ghost"
            />
          }
        >
          {allLiked ? (
            <HeartBreakIcon aria-hidden="true" data-icon="inline-start" />
          ) : (
            <HeartIcon aria-hidden="true" data-icon="inline-start" />
          )}
          <span className="grid justify-items-start">
            <span className="col-start-1 row-start-1">{allLiked ? "Unlike" : "Like"}</span>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1">
              Unlike
            </span>
          </span>
        </BarAction>
        {canRemove && (
          <BarAction
            action="removeFromPlaylist"
            label="Remove from playlist"
            render={
              <Button
                className="rounded-lg px-2 text-danger has-data-[icon=inline-start]:pl-2 hover:not-data-disabled:bg-danger-subtle hover:not-data-disabled:text-danger focus-visible:text-danger focus-visible:-outline-offset-2 [&_svg]:fill-danger"
                onClick={() => onAction("removeFromPlaylist")}
                variant="ghost"
              />
            }
          >
            <MinusCircleIcon aria-hidden="true" data-icon="inline-start" />
            Remove
          </BarAction>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="More actions for the selection"
                className="rounded-lg focus-visible:-outline-offset-2"
                data-bar-action="createPlaylist"
                size="icon"
                variant="ghost"
              />
            }
          >
            <DotsThreeIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-none" side="top" sideOffset={8}>
            <DropdownMenuItem
              aria-keyshortcuts={selectionKeyShortcuts("createPlaylist", window.lume.isMac)}
              className="whitespace-nowrap"
              onClick={() => onAction("createPlaylist")}
            >
              <PlusIcon aria-hidden="true" />
              New playlist…
              <SelectionMenuShortcut action="createPlaylist" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div
          aria-orientation="vertical"
          className="h-4 w-px shrink-0 bg-separator"
          role="separator"
        />
        <Button
          aria-keyshortcuts="Escape"
          aria-label="Clear selection"
          className="rounded-lg px-2.5 font-mono text-meta focus-visible:-outline-offset-2"
          onClick={onClear}
          variant="ghost"
        >
          esc
        </Button>
      </div>
    </TooltipProvider>
  );
}

// Chromium matches :focus-visible when focus returns to a button after a pointer-driven dialog,
// so the tooltip follows the app's own focus modality instead.
function BarAction({
  action,
  children,
  label,
  render,
}: {
  action: SelectionAction;
  children: ReactNode;
  label: string;
  render: ReactElement;
}) {
  return (
    <Tooltip
      onOpenChange={(open, details) => {
        if (
          open &&
          details.reason === "trigger-focus" &&
          document.documentElement.hasAttribute("data-pointer-focus")
        ) {
          details.cancel();
        }
      }}
    >
      <TooltipTrigger
        aria-keyshortcuts={selectionKeyShortcuts(action, window.lume.isMac)}
        data-bar-action={action}
        render={render}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>
        {label}
        <Kbd>
          <SelectionShortcutKeys action={action} />
        </Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

function moveFocusWithArrows(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const index = buttons.findIndex((button) => button === document.activeElement);

  if (index < 0) return;

  event.preventDefault();
  buttons[
    (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length
  ].focus();
}
