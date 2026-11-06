import { ContextMenu } from "@base-ui/react/context-menu";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { memo } from "react";
import type { Track } from "../../../shared/lib";
import { LikeButton } from "@/components/like-button";
import { type ArtworkState, TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAddedDate } from "@/lib/format-added-date";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import type { TrackAction } from "@/components/track-list/actions/track-actions";
import { TrackRowMenuItems } from "@/components/track-list/track-row-menu-items";
import type {
  RowMenu,
  RowMenuTrigger,
  TargetEntry,
} from "@/components/track-list/selection/track-selection";

export type TrackRowActions = {
  closeMenu: (entryId: number, trigger: RowMenuTrigger) => void;
  openMenu: (entryId: number, trigger: RowMenuTrigger) => void;
  run: (action: TrackAction) => void;
  toggleLike: (entry: TargetEntry) => void;
};

type TrackRowProps = {
  actions: TrackRowActions;
  addedToListAt: number;
  artworkState: ArtworkState | undefined;
  canQueue: boolean;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  isSelectionEnd: boolean;
  isSelectionStart: boolean;
  isTabStop: boolean;
  menuTarget: RowMenu | null;
  playlistTitle: string | null;
  sourceEntryId: number;
  track: Track;
};

export const TrackRow = memo(function TrackRow({
  actions,
  addedToListAt,
  artworkState,
  canQueue,
  index,
  isActive,
  isSelected,
  isSelectionEnd,
  isSelectionStart,
  isTabStop,
  menuTarget,
  playlistTitle,
  sourceEntryId,
  track,
}: TrackRowProps) {
  const isPlaylist = playlistTitle !== null;

  const menuItems = menuTarget && (
    <TrackRowMenuItems
      canQueue={canQueue}
      menu={menuTarget}
      playlistTitle={playlistTitle}
      run={actions.run}
    />
  );

  const menuProps = (trigger: RowMenuTrigger) => ({
    onOpenChange: (open: boolean) => {
      if (open) actions.openMenu(sourceEntryId, trigger);
      else actions.closeMenu(sourceEntryId, trigger);
    },
    open: menuTarget?.open === true && menuTarget.trigger === trigger,
  });

  const metadataColor = track.available ? "text-secondary" : "text-disabled";

  return (
    <ContextMenu.Root {...menuProps("context")}>
      <ContextMenu.Trigger
        render={
          <tr
            aria-current={isActive ? "true" : undefined}
            aria-rowindex={index + 2}
            aria-selected={isSelected}
            className={cn(
              "group/track-row cursor-default rounded-md focus-visible:-outline-offset-2 *:h-10",
              isSelected
                ? "*:bg-selected"
                : "hover:*:bg-hover *:first:rounded-l-md *:last:rounded-r-md",
              isSelectionStart && "*:first:rounded-tl-md *:last:rounded-tr-md",
              isSelectionEnd && "*:first:rounded-bl-md *:last:rounded-br-md",
            )}
            data-entry-id={sourceEntryId}
            onMouseDown={(event) => {
              if (event.detail > 1) event.preventDefault();
            }}
            tabIndex={isTabStop ? 0 : -1}
          />
        }
      >
        {isPlaylist && (
          <td className="pl-4 font-mono text-meta text-tertiary tabular-nums">{index + 1}</td>
        )}
        <td className="pl-4">
          <div className="flex min-w-0 items-center gap-2">
            <TrackArtwork
              artworkUrl={track.artworkUrl}
              className={cn("size-8", !track.available && "opacity-disabled")}
              state={artworkState}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-left text-body font-medium",
                  !track.available ? "text-disabled" : isActive ? "text-accent" : "text-primary",
                )}
                data-truncate
                dir="auto"
              >
                {track.title}
              </p>
              <p
                className={cn("truncate text-left text-meta", metadataColor)}
                data-truncate
                dir="auto"
              >
                {track.artists.join(", ") || "Unknown artist"}
              </p>
            </div>
            {!track.available && (
              <span className="shrink-0 text-meta text-secondary">Unavailable</span>
            )}
            <div
              className="contents"
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <DropdownMenu {...menuProps("overflow")}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={`More options for ${track.title}`}
                      className="opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100 data-popup-open:opacity-100"
                      onMouseDown={(event) => event.preventDefault()}
                      size="icon-sm"
                      static
                      tabIndex={isTabStop ? 0 : -1}
                      variant="row-action"
                    />
                  }
                >
                  <DotsThreeIcon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-80" finalFocus>
                  {menuItems}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </td>
        <td className={cn("hidden pl-4 @3xl:table-cell", metadataColor)}>
          <p className="truncate text-left text-body" data-truncate dir="auto">
            {track.album || "Unknown album"}
          </p>
        </td>
        <td className={cn("hidden truncate pl-4 text-meta @3xl:table-cell", metadataColor)}>
          {formatAddedDate(addedToListAt)}
        </td>
        <td
          className="pl-4"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <LikeButton
            className={cn(
              "-m-1",
              track.likedAt === null &&
                "opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100",
            )}
            label={track.likedAt === null ? `Like ${track.title}` : `Unlike ${track.title}`}
            liked={track.likedAt !== null}
            onToggle={() =>
              actions.toggleLike({
                artworkUrl: track.artworkUrl,
                liked: track.likedAt !== null,
                sourceEntryId,
                title: track.title,
                trackId: track.id,
              })
            }
            tabIndex={isTabStop ? 0 : -1}
          />
        </td>
        <td className={cn("pr-4 pl-4 text-right font-mono text-meta tabular-nums", metadataColor)}>
          {formatDuration(track.duration)}
        </td>
      </ContextMenu.Trigger>
      <DropdownMenuContent className="max-w-80" finalFocus side="right" sideOffset={0}>
        {menuItems}
      </DropdownMenuContent>
    </ContextMenu.Root>
  );
});
