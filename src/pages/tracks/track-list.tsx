import {
  DotsThreeIcon,
  HeartIcon,
  ListPlusIcon,
  PlaylistIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { usePlayback } from "@/hooks/use-playback";
import { collectionSource } from "@/lib/queue/source";
import type { Track } from "../../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { formatAddedDate } from "@/lib/format-added-date";
import { formatDuration } from "@/lib/format-duration";
import { showTruncatedText } from "@/lib/show-truncated-text";
import { useCreatePlaylistFromTrackMutation, useSetTrackLiked } from "@/lib/library-query";
import { cn } from "@/lib/utils";

export type TrackListItem = {
  sourceEntryId: number;
  track: Track;
};

type TrackListProps = {
  caption: string;
  items: readonly TrackListItem[];
  playlistId?: number;
  renderMenuItems?: (item: TrackListItem) => ReactNode;
};

const rowHeight = 40;

const headerHeight = 32;

// The 4px gap between the column header and the first row
const listInset = 4;

// TanStack Virtual's virtualizer is a mutable object, which the React Compiler can't memoize.
export function TrackList({ caption, items, playlistId, renderMenuItems }: TrackListProps) {
  "use no memo";
  const playback = usePlayback();
  const navigate = useNavigate();
  const createPlaylistFromTrack = useCreatePlaylistFromTrackMutation();
  const setTrackLiked = useSetTrackLiked();
  const addDialogTriggerRef = useRef<HTMLElement | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const isPlaylist = playlistId !== undefined;

  useLayoutEffect(() => {
    const table = tableRef.current;
    const scroller = table?.parentElement?.closest<HTMLElement>("[data-scroll-container]");

    if (!table || !scroller) return;

    setScrollElement(scroller);

    const measure = () =>
      setScrollMargin(
        table.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop,
      );

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(table);

    return () => observer.disconnect();
  }, []);

  const handleAddToPlaylist = (track: Track, trigger: HTMLButtonElement) => {
    addDialogTriggerRef.current = trigger;
    setTrackToAdd(track);
    setAddDialogOpen(true);
  };

  const handleCreatePlaylist = (track: Track) => {
    createPlaylistFromTrack.mutate(track.id, {
      onError: (error) => {
        toast.add({
          description: error.message,
          priority: "high",
          title: "Could not create playlist",
          type: "error",
        });
      },
      onSuccess: (playlist) => {
        void navigate({
          params: { playlistId: playlist.id },
          to: "/playlists/$playlistId",
        });
      },
    });
  };

  const handleSetTrackLiked = (track: Track) => {
    setTrackLiked.mutate(
      { liked: track.likedAt === null, trackId: track.id },
      {
        onError: (error) => {
          toast.add({
            description: error.message,
            priority: "high",
            title: "Could not update like",
            type: "error",
          });
        },
      },
    );
  };

  const playItem = (item: TrackListItem) => {
    if (!item.track.available) return;

    void playback.playSourceEntry({
      source: collectionSource(playlistId),
      sourceEntryId: item.sourceEntryId,
    });
  };

  const tabStopEntryId = items.some((item) => item.sourceEntryId === selectedEntryId)
    ? selectedEntryId
    : items[0]?.sourceEntryId;

  const tabStopIndex = items.findIndex((item) => item.sourceEntryId === tabStopEntryId);

  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: scrollElement !== null,
    estimateSize: () => rowHeight,
    getScrollElement: () => scrollElement,
    overscan: 8,
    paddingStart: headerHeight + listInset,
    // The tab stop always renders, so the list keeps its Tab stop and focus while scrolled away.
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);

      return tabStopIndex < 0 || indexes.includes(tabStopIndex)
        ? indexes
        : [...indexes, tabStopIndex].sort((left, right) => left - right);
    },
    scrollMargin,
    scrollPaddingStart: headerHeight + listInset,
  });

  const renderedIndexes = scrollElement
    ? virtualizer.getVirtualItems().map((virtualItem) => virtualItem.index)
    : items.map((_item, index) => index);

  const focusRow = (index: number) => {
    const target = Math.max(0, Math.min(items.length - 1, index));
    const item = items[target];

    if (!item) return;

    setSelectedEntryId(item.sourceEntryId);
    pendingFocusIndex.current = target;

    if (scrollElement) virtualizer.scrollToIndex(target);
  };

  useLayoutEffect(() => {
    const index = pendingFocusIndex.current;

    if (index === null) return;

    const row = tableRef.current?.querySelector<HTMLElement>(
      `tr[data-entry-id="${items[index]?.sourceEntryId}"]`,
    );

    if (!row) return;

    pendingFocusIndex.current = null;
    row.focus({ preventScroll: scrollElement !== null });
  });

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.target !== event.currentTarget) return;

    const pageSize = Math.max(
      1,
      Math.floor((scrollElement?.clientHeight ?? window.innerHeight) / rowHeight) - 1,
    );

    const target = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      End: items.length - 1,
      Home: 0,
      PageDown: index + pageSize,
      PageUp: index - pageSize,
    }[event.key];

    if (target !== undefined) {
      event.preventDefault();
      focusRow(target);

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      playItem(items[index]);
    }
  };

  function renderRow(index: number) {
    const item = items[index];
    const track = item.track;

    const isActive =
      playback.activeSourceEntryId === item.sourceEntryId &&
      playback.activeSourcePlaylistId === (playlistId ?? null);

    const isSelected = item.sourceEntryId === selectedEntryId;
    const isTabStop = item.sourceEntryId === tabStopEntryId;
    const metadataColor = track.available ? "text-secondary" : "text-disabled";

    return (
      <tr
        aria-current={isActive ? "true" : undefined}
        aria-rowindex={index + 2}
        aria-selected={isSelected}
        className={cn(
          "group/track-row cursor-default rounded-md focus-visible:-outline-offset-2 *:h-10 *:first:rounded-l-md *:last:rounded-r-md",
          isSelected ? "*:bg-selected" : isActive ? "*:bg-accent-subtle" : "hover:*:bg-page-hover",
        )}
        data-entry-id={item.sourceEntryId}
        key={item.sourceEntryId}
        onClick={() => setSelectedEntryId(item.sourceEntryId)}
        onDoubleClick={() => playItem(item)}
        onKeyDown={(event) => handleRowKeyDown(event, index)}
        tabIndex={isTabStop ? 0 : -1}
      >
        {isPlaylist && (
          <td className="pl-4 font-mono text-meta text-tertiary tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </td>
        )}
        <td className="pl-4">
          <div className="flex min-w-0 items-center gap-2">
            <TrackArtwork
              artworkUrl={track.artworkUrl}
              className={cn("size-8", !track.available && "opacity-disabled")}
              state={
                isActive
                  ? playback.isPlaying
                    ? "playing"
                    : "paused"
                  : isSelected
                    ? "selected"
                    : undefined
              }
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-left text-body font-medium",
                  track.available ? "text-primary" : "text-disabled",
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
              <TrackRowMenu
                canAddToQueue={playback.queue !== null}
                isCreatingPlaylist={createPlaylistFromTrack.isPending}
                onAddToQueue={() => playback.enqueueTrack(track.id)}
                onAddToPlaylist={handleAddToPlaylist}
                onCreatePlaylist={handleCreatePlaylist}
                tabIndex={isTabStop ? 0 : -1}
                track={track}
              >
                {renderMenuItems?.(item)}
              </TrackRowMenu>
            </div>
          </div>
        </td>
        <td className={cn("hidden pl-4 @3xl:table-cell", metadataColor)}>
          <p className="truncate text-left text-body" data-truncate dir="auto">
            {track.album || "Unknown album"}
          </p>
        </td>
        <td className={cn("hidden truncate pl-4 text-meta @3xl:table-cell", metadataColor)}>
          {formatAddedDate(track.addedAt)}
        </td>
        <td
          className="pl-4"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Button
            aria-label={track.likedAt === null ? `Like ${track.title}` : `Unlike ${track.title}`}
            aria-pressed={track.likedAt !== null}
            className={cn(
              "-m-1",
              track.likedAt === null &&
                "opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100",
            )}
            onClick={() => handleSetTrackLiked(track)}
            onPointerDown={(event) => event.preventDefault()}
            size="icon-sm"
            static
            tabIndex={isTabStop ? 0 : -1}
            type="button"
            variant="ghost"
          >
            <HeartIcon aria-hidden="true" weight={track.likedAt === null ? "regular" : "fill"} />
          </Button>
        </td>
        <td className={cn("pr-4 pl-4 text-right font-mono text-meta tabular-nums", metadataColor)}>
          {formatDuration(track.duration)}
        </td>
      </tr>
    );
  }

  const columnCount = isPlaylist ? 6 : 5;
  const rows: ReactNode[] = [];
  let nextIndex = 0;

  const addGap = (end: number) => {
    if (end <= nextIndex) return;

    rows.push(
      <tr aria-hidden="true" key={`gap-${nextIndex}`}>
        <td colSpan={columnCount} style={{ height: (end - nextIndex) * rowHeight }} />
      </tr>,
    );
  };

  for (const index of renderedIndexes) {
    addGap(index);
    rows.push(renderRow(index));
    nextIndex = index + 1;
  }

  if (scrollElement) addGap(items.length);

  return (
    <div className="@container" id="tracks">
      <table
        className="w-full table-fixed border-separate border-spacing-0 px-2"
        onPointerOver={showTruncatedText}
        aria-rowcount={items.length + 1}
        ref={tableRef}
        role="grid"
      >
        <caption className="sr-only">{caption}</caption>
        <TrackListHead isPlaylist={isPlaylist} />
        <tbody className="before:table-row before:h-1">{rows}</tbody>
      </table>
      {trackToAdd && (
        <AddToPlaylistDialog
          finalFocus={addDialogTriggerRef}
          onCreatePlaylist={handleCreatePlaylist}
          onOpenChange={setAddDialogOpen}
          open={addDialogOpen}
          track={trackToAdd}
        />
      )}
    </div>
  );
}

function TrackListHead({ isPlaylist }: { isPlaylist: boolean }) {
  return (
    <thead className="sticky top-0 z-10 text-left font-mono text-meta tracking-[0.08em] text-secondary uppercase">
      <tr
        aria-rowindex={1}
        className="*:bg-page *:first:relative *:first:before:absolute *:first:before:top-0 *:first:before:right-full *:first:before:-bottom-px *:first:before:w-2 *:first:before:border-b *:first:before:border-separator *:first:before:bg-page *:last:relative *:last:after:absolute *:last:after:top-0 *:last:after:-bottom-px *:last:after:left-full *:last:after:w-2 *:last:after:border-b *:last:after:border-separator *:last:after:bg-page"
      >
        {isPlaylist && (
          <th className="h-8 w-10 border-b border-separator pl-4 font-normal" scope="col">
            #
          </th>
        )}
        <th className="h-8 border-b border-separator pl-14 font-normal" scope="col">
          Title
        </th>
        <th
          className="hidden h-8 w-[30%] border-b border-separator pl-4 font-normal @3xl:table-cell @6xl:w-100"
          scope="col"
        >
          Album
        </th>
        <th
          className="hidden h-8 w-28 border-b border-separator pl-4 font-normal @3xl:table-cell"
          scope="col"
        >
          Added
        </th>
        <th className="h-8 w-8 border-b border-separator font-normal" scope="col">
          <span className="sr-only">Like</span>
        </th>
        <th
          className="h-8 w-22 border-b border-separator pr-4 pl-4 text-right font-normal"
          scope="col"
        >
          Time
        </th>
      </tr>
    </thead>
  );
}

// Paper's placeholder rows (frame 11 B): title, artist and album widths, and opacity
const skeletonRows = [
  [144, 88, 120, 1],
  [112, 64, 160, 0.8],
  [176, 104, 88, 0.6],
  [96, 72, 136, 0.45],
  [152, 88, 104, 0.3],
  [128, 96, 120, 0.15],
];

export function TrackListSkeleton({ isPlaylist }: { isPlaylist: boolean }) {
  return (
    <div aria-hidden="true" className="@container">
      <table className="w-full table-fixed border-separate border-spacing-0 px-2">
        <TrackListHead isPlaylist={isPlaylist} />
        <tbody className="before:table-row before:h-1">
          {skeletonRows.map(([title, artist, album, opacity], index) => (
            <tr className="*:h-10" key={index} style={{ opacity }}>
              {isPlaylist && <td />}
              <td className="pl-4">
                <div className="flex items-center gap-2">
                  <span className="size-8 shrink-0 rounded-sm bg-raised" />
                  <span className="flex flex-col gap-1.5">
                    <span className="h-2 rounded-xs bg-raised" style={{ width: title }} />
                    <span className="h-2 rounded-xs bg-raised" style={{ width: artist }} />
                  </span>
                </div>
              </td>
              <td className="hidden pl-4 @3xl:table-cell">
                <span className="block h-2 rounded-xs bg-raised" style={{ width: album }} />
              </td>
              <td className="hidden @3xl:table-cell" />
              <td />
              <td className="pr-4">
                <span className="ml-auto block h-2 w-7 rounded-xs bg-raised" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrackRowMenu({
  canAddToQueue,
  children,
  isCreatingPlaylist,
  onAddToQueue,
  onAddToPlaylist,
  onCreatePlaylist,
  tabIndex,
  track,
}: {
  canAddToQueue: boolean;
  children?: ReactNode;
  isCreatingPlaylist: boolean;
  onAddToQueue: () => void;
  onAddToPlaylist: (track: Track, trigger: HTMLButtonElement) => void;
  onCreatePlaylist: (track: Track) => void;
  tabIndex: number;
  track: Track;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`More options for ${track.title}`}
            className="opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100 data-popup-open:opacity-100"
            onMouseDown={(event) => event.preventDefault()}
            ref={triggerRef}
            size="icon-sm"
            static
            tabIndex={tabIndex}
            variant="row-action"
          />
        }
      >
        <DotsThreeIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canAddToQueue && (
          <>
            <DropdownMenuItem onClick={onAddToQueue}>
              <ListPlusIcon aria-hidden="true" />
              Add to queue
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            if (triggerRef.current) onAddToPlaylist(track, triggerRef.current);
          }}
        >
          <PlaylistIcon aria-hidden="true" />
          Add to playlist…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isCreatingPlaylist} onClick={() => onCreatePlaylist(track)}>
          <PlusIcon aria-hidden="true" />
          New playlist from track
        </DropdownMenuItem>
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
