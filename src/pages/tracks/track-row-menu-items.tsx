import {
  HeartBreakIcon,
  HeartIcon,
  ListPlusIcon,
  MinusCircleIcon,
  PlaylistIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SelectionMenuShortcut } from "@/pages/tracks/selection-shortcut-keys";
import { type SelectionAction, selectionKeyShortcuts } from "@/pages/tracks/selection-shortcuts";
import type { TrackAction } from "@/pages/tracks/track-actions";
import type { RowMenu } from "@/pages/tracks/track-selection";

export function TrackRowMenuItems({
  canAddToQueue,
  menu,
  playlistTitle,
  run,
}: {
  canAddToQueue: boolean;
  menu: RowMenu;
  playlistTitle: string | null;
  run: (action: TrackAction) => void;
}) {
  const { entryId: returnTo, namesTarget, target, targetsSelection } = menu;
  const count = target.entries.length;
  const countLabel = count.toLocaleString();
  const likes = target.entries.some((entry) => !entry.liked);

  const keyShortcuts = (action: SelectionAction) =>
    targetsSelection ? selectionKeyShortcuts(action, window.lume.isMac) : undefined;

  const shortcut = (action: SelectionAction) =>
    targetsSelection && <SelectionMenuShortcut action={action} />;

  const items = (
    <>
      {canAddToQueue && (
        <>
          <DropdownMenuItem
            aria-keyshortcuts={keyShortcuts("queue")}
            className="whitespace-nowrap"
            onClick={() => run({ kind: "queue", target })}
          >
            <ListPlusIcon aria-hidden="true" />
            Add to queue
            {shortcut("queue")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem
        aria-keyshortcuts={keyShortcuts("addToPlaylist")}
        className="whitespace-nowrap"
        onClick={() => run({ kind: "addToPlaylist", returnTo, target })}
      >
        <PlaylistIcon aria-hidden="true" />
        Add to playlist…
        {shortcut("addToPlaylist")}
      </DropdownMenuItem>
      <DropdownMenuItem
        aria-keyshortcuts={keyShortcuts("createPlaylist")}
        className="whitespace-nowrap"
        onClick={() => run({ kind: "createPlaylist", returnTo, target })}
      >
        <PlusIcon aria-hidden="true" />
        New playlist…
        {shortcut("createPlaylist")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        aria-keyshortcuts={keyShortcuts("like")}
        className="whitespace-nowrap"
        onClick={() => run({ kind: "like", target })}
      >
        {likes ? <HeartIcon aria-hidden="true" /> : <HeartBreakIcon aria-hidden="true" />}
        {likes ? "Like" : "Unlike"}
        {shortcut("like")}
      </DropdownMenuItem>
      {playlistTitle !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            aria-keyshortcuts={keyShortcuts("removeFromPlaylist")}
            className="whitespace-nowrap"
            onClick={() => run({ kind: "removeFromPlaylist", target })}
            variant="danger"
          >
            <MinusCircleIcon aria-hidden="true" />
            <span className="truncate" title={`Remove from ${playlistTitle}`}>
              {count === 1 ? "Remove" : `Remove ${countLabel}`} from {playlistTitle}
            </span>
            {shortcut("removeFromPlaylist")}
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  if (!namesTarget) return items;

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="block max-w-72 truncate leading-8">
        {target.entries[0].title}
      </DropdownMenuLabel>
      {items}
    </DropdownMenuGroup>
  );
}
