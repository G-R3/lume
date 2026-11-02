import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowFatUpIcon,
  CommandIcon,
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
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/format-duration";
import { duration as motionDuration, ease, spring } from "@/lib/motion";

export type SelectionBarAction =
  | "queue"
  | "like"
  | "addToPlaylist"
  | "createPlaylist"
  | "removeFromPlaylist";

type SelectionBarProps = {
  allLiked: boolean;
  canAddToQueue: boolean;
  canRemove: boolean;
  count: number;
  duration: number;
  onAction: (action: SelectionBarAction) => void;
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

  return (
    <AnimatePresence custom={barMotion}>
      {shown && (
        <motion.div
          animate="shown"
          className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center"
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
            variants={barRiseVariants}
          >
            <SelectionBar {...barProps} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function NewPlaylistShortcut() {
  return (
    <DropdownMenuShortcut
      aria-hidden="true"
      className="flex items-center pl-2 group-data-highlighted/dropdown-menu-item:text-primary"
    >
      {window.lume.isMac ? (
        <>
          <CommandIcon className="size-3" weight="bold" />
          <ArrowFatUpIcon className="size-3" weight="bold" />N
        </>
      ) : (
        "Ctrl+Shift+N"
      )}
    </DropdownMenuShortcut>
  );
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
      <Button
        className="rounded-lg text-primary hover:not-data-disabled:text-primary focus-visible:-outline-offset-2 [&_svg]:text-secondary"
        data-bar-action="addToPlaylist"
        onClick={() => onAction("addToPlaylist")}
        variant="ghost"
      >
        <PlaylistIcon aria-hidden="true" data-icon="inline-start" />
        Add to playlist…
      </Button>
      {canAddToQueue && (
        <Button
          className="rounded-lg text-primary hover:not-data-disabled:text-primary focus-visible:-outline-offset-2 [&_svg]:text-secondary"
          onClick={() => onAction("queue")}
          variant="ghost"
        >
          <ListPlusIcon aria-hidden="true" data-icon="inline-start" />
          Add to queue
        </Button>
      )}
      <Button
        className="rounded-lg text-primary hover:not-data-disabled:text-primary focus-visible:-outline-offset-2 [&_svg]:text-secondary"
        onClick={() => onAction("like")}
        variant="ghost"
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
      </Button>
      {canRemove && (
        <Button
          className="rounded-lg text-danger hover:not-data-disabled:bg-danger-subtle hover:not-data-disabled:text-danger focus-visible:text-danger focus-visible:-outline-offset-2 [&_svg]:fill-danger"
          onClick={() => onAction("removeFromPlaylist")}
          variant="ghost"
        >
          <MinusCircleIcon aria-hidden="true" data-icon="inline-start" />
          Remove
        </Button>
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
            aria-keyshortcuts={window.lume.isMac ? "Meta+Shift+N" : "Control+Shift+N"}
            className="whitespace-nowrap"
            onClick={() => onAction("createPlaylist")}
          >
            <PlusIcon aria-hidden="true" />
            New playlist from selection…
            <NewPlaylistShortcut />
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
