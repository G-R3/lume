import { Toolbar } from "@base-ui/react/toolbar";
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

export type SelectionBarAction =
  | "queue"
  | "like"
  | "addToPlaylist"
  | "createPlaylist"
  | "removeFromPlaylist";

export function NewPlaylistShortcut() {
  return (
    <DropdownMenuShortcut aria-hidden="true" className="flex items-center pl-2">
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

export function SelectionBar({
  allLiked,
  canAddToQueue,
  canRemove,
  count,
  duration,
  onAction,
  onClear,
}: {
  allLiked: boolean;
  canAddToQueue: boolean;
  canRemove: boolean;
  count: number;
  duration: number;
  onAction: (action: SelectionBarAction) => void;
  onClear: () => void;
}) {
  const countLabel = `${count.toLocaleString()} selected`;

  return (
    <Toolbar.Root
      aria-label={countLabel}
      className="flex items-center gap-0.5 rounded-xl bg-overlay p-1 shadow-menu inset-ring inset-ring-strong surface-overlay"
    >
      <div className="flex h-8 min-w-34 items-center gap-2 pr-2.5 pl-3 tabular-nums">
        <span className="text-body font-medium text-primary">{countLabel}</span>
        <span className="font-mono text-meta text-secondary">{formatDuration(duration)}</span>
      </div>
      <Toolbar.Separator className="h-4 w-px shrink-0 bg-separator" />
      <Toolbar.Button
        onClick={() => onAction("addToPlaylist")}
        render={
          <Button
            className="rounded-lg text-primary hover:not-data-disabled:text-primary [&_svg]:text-secondary"
            variant="ghost"
          />
        }
      >
        <PlaylistIcon aria-hidden="true" data-icon="inline-start" />
        Add to playlist…
      </Toolbar.Button>
      {canAddToQueue && (
        <Toolbar.Button
          onClick={() => onAction("queue")}
          render={
            <Button
              className="rounded-lg text-primary hover:not-data-disabled:text-primary [&_svg]:text-secondary"
              variant="ghost"
            />
          }
        >
          <ListPlusIcon aria-hidden="true" data-icon="inline-start" />
          Add to queue
        </Toolbar.Button>
      )}
      <Toolbar.Button
        onClick={() => onAction("like")}
        render={
          <Button
            className="rounded-lg text-primary hover:not-data-disabled:text-primary [&_svg]:text-secondary"
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
      </Toolbar.Button>
      {canRemove && (
        <Toolbar.Button
          onClick={() => onAction("removeFromPlaylist")}
          render={
            <Button
              className="rounded-lg text-danger hover:not-data-disabled:bg-danger-subtle hover:not-data-disabled:text-danger focus-visible:text-danger [&_svg]:fill-danger"
              variant="ghost"
            />
          }
        >
          <MinusCircleIcon aria-hidden="true" data-icon="inline-start" />
          Remove
        </Toolbar.Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Toolbar.Button
              aria-label="More actions for the selection"
              render={<Button className="rounded-lg" size="icon" variant="ghost" />}
            />
          }
        >
          <DotsThreeIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={8}>
          <DropdownMenuItem
            aria-keyshortcuts={window.lume.isMac ? "Meta+Shift+N" : "Control+Shift+N"}
            onClick={() => onAction("createPlaylist")}
          >
            <PlusIcon aria-hidden="true" />
            New playlist from selection…
            <NewPlaylistShortcut />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Toolbar.Separator className="h-4 w-px shrink-0 bg-separator" />
      <Toolbar.Button
        aria-keyshortcuts="Escape"
        aria-label="Clear selection"
        onClick={onClear}
        render={<Button className="rounded-lg px-2.5 font-mono text-meta" variant="ghost" />}
      >
        esc
      </Toolbar.Button>
    </Toolbar.Root>
  );
}
