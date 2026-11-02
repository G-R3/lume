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
import { NewPlaylistShortcut } from "@/pages/tracks/selection-bar";
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

  const items = (
    <>
      {canAddToQueue && (
        <>
          <DropdownMenuItem onClick={() => run({ kind: "queue", target })}>
            <ListPlusIcon aria-hidden="true" />
            Add to queue
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={() => run({ kind: "addToPlaylist", returnTo, target })}>
        <PlaylistIcon aria-hidden="true" />
        Add to playlist…
      </DropdownMenuItem>
      <DropdownMenuItem
        aria-keyshortcuts={
          targetsSelection ? (window.lume.isMac ? "Meta+Shift+N" : "Control+Shift+N") : undefined
        }
        onClick={() => run({ kind: "createPlaylist", returnTo, target })}
      >
        <PlusIcon aria-hidden="true" />
        {count === 1 ? "New playlist from track…" : "New playlist from selection…"}
        {targetsSelection && <NewPlaylistShortcut />}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => run({ kind: "like", target })}>
        {likes ? <HeartIcon aria-hidden="true" /> : <HeartBreakIcon aria-hidden="true" />}
        {likes ? "Like" : "Unlike"}
      </DropdownMenuItem>
      {playlistTitle !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => run({ kind: "removeFromPlaylist", target })}
            variant="danger"
          >
            <MinusCircleIcon aria-hidden="true" />
            <span className="truncate" title={`Remove from ${playlistTitle}`}>
              {count === 1 ? "Remove" : `Remove ${countLabel}`} from {playlistTitle}
            </span>
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  if (!namesTarget) return items;

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="block max-w-72 truncate leading-8">
        {count === 1 ? target.entries[0].title : `${countLabel} tracks`}
      </DropdownMenuLabel>
      {items}
    </DropdownMenuGroup>
  );
}
