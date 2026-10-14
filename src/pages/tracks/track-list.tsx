import { DotsThreeIcon, ListPlusIcon, PlaylistIcon, PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  memo,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePlayback } from "@/hooks/use-playback";
import { collectionSource } from "@/lib/queue/source";
import type { Track } from "../../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { LikeButton } from "@/components/like-button";
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

// The React Compiler skips this component: it lists `useVirtualizer` as incompatible with
// memoization. That's why the row callbacks go through `useStableActions` instead.
export function TrackList({ caption, items, playlistId, renderMenuItems }: TrackListProps) {
  const playback = usePlayback();
  const navigate = useNavigate();
  const createPlaylistFromTrack = useCreatePlaylistFromTrackMutation();
  const setTrackLiked = useSetTrackLiked();
  const addToPlaylistTriggerRef = useRef<HTMLElement | null>(null);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  // `undefined` until the first layout effect has looked for the list's scroll container
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null | undefined>(undefined);
  const [scrollMargin, setScrollMargin] = useState(0);
  const isPlaylist = playlistId !== undefined;

  useLayoutEffect(() => {
    const table = tableRef.current;
    const container = table?.parentElement?.closest<HTMLElement>("[data-scroll-container]") ?? null;

    setScrollContainer(container);

    if (!table || !container) return;

    const measureScrollMargin = () =>
      setScrollMargin(
        table.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop,
      );

    measureScrollMargin();
    const observer = new ResizeObserver(measureScrollMargin);
    observer.observe(container);
    observer.observe(table);

    return () => observer.disconnect();
  }, []);

  const openAddToPlaylist = (track: Track, trigger: HTMLButtonElement) => {
    addToPlaylistTriggerRef.current = trigger;
    setTrackToAdd(track);
    setIsAddToPlaylistOpen(true);
  };

  const createPlaylistWithTrack = (track: Track) => {
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

  const toggleTrackLiked = (track: Track) => {
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

  // The selected row, else the first. It scans every item, so it reruns only when the items or the
  // selection change, not on every scroll frame.
  const { tabStopEntryId, tabStopIndex } = useMemo(() => {
    const selectedIndex = items.findIndex((item) => item.sourceEntryId === selectedEntryId);
    const index = selectedIndex < 0 ? 0 : selectedIndex;

    return { tabStopEntryId: items[index]?.sourceEntryId, tabStopIndex: items.length ? index : -1 };
  }, [items, selectedEntryId]);

  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: Boolean(scrollContainer),
    estimateSize: () => rowHeight,
    getScrollElement: () => scrollContainer ?? null,
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

  // Nothing renders before the container is known; rendering every item would mount the whole
  // library for one commit. Lists without a scroll container render every item.
  const mountedIndexes =
    scrollContainer === undefined
      ? []
      : scrollContainer
        ? virtualizer.getVirtualItems().map((virtualItem) => virtualItem.index)
        : items.map((_item, index) => index);

  const focusRow = (index: number) => {
    const target = Math.max(0, Math.min(items.length - 1, index));
    const item = items[target];

    if (!item) return;

    setSelectedEntryId(item.sourceEntryId);
    pendingFocusIndex.current = target;

    if (scrollContainer) virtualizer.scrollToIndex(target);
  };

  useLayoutEffect(() => {
    const index = pendingFocusIndex.current;

    if (index === null) return;

    const row = tableRef.current?.querySelector<HTMLElement>(
      `tr[data-entry-id="${items[index]?.sourceEntryId}"]`,
    );

    if (!row) return;

    pendingFocusIndex.current = null;
    row.focus({ preventScroll: Boolean(scrollContainer) });
  });

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.target !== event.currentTarget) return;

    const pageSize = Math.max(
      1,
      Math.floor((scrollContainer?.clientHeight ?? window.innerHeight) / rowHeight) - 1,
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

  const rowActions = useStableActions<TrackRowActions>({
    addToPlaylist: openAddToPlaylist,
    addToQueue: (trackId) => playback.enqueueTrack(trackId),
    createPlaylist: createPlaylistWithTrack,
    keyDown: handleRowKeyDown,
    play: playItem,
    select: setSelectedEntryId,
    toggleLike: toggleTrackLiked,
  });

  function renderTrackRow(index: number) {
    const item = items[index];

    const isActive =
      playback.activeSourceEntryId === item.sourceEntryId &&
      playback.activeSourcePlaylistId === (playlistId ?? null);

    const isSelected = item.sourceEntryId === selectedEntryId;

    return (
      <TrackRow
        actions={rowActions}
        artworkState={
          isActive
            ? playback.isPlaying
              ? "playing"
              : "paused"
            : isSelected
              ? "selected"
              : undefined
        }
        canAddToQueue={playback.queue !== null}
        index={index}
        isActive={isActive}
        isCreatingPlaylist={createPlaylistFromTrack.isPending}
        isPlaylist={isPlaylist}
        isSelected={isSelected}
        isTabStop={item.sourceEntryId === tabStopEntryId}
        item={item}
        key={item.sourceEntryId}
        renderMenuItems={renderMenuItems}
      />
    );
  }

  const columnCount = isPlaylist ? 6 : 5;
  const bodyRows: ReactNode[] = [];
  let nextUnmountedIndex = 0;

  // One empty row stands in for the unmounted rows before `untilIndex`, keeping the scroll height
  const addSpacerRow = (untilIndex: number) => {
    if (untilIndex <= nextUnmountedIndex) return;

    bodyRows.push(
      <tr aria-hidden="true" key={`spacer-${nextUnmountedIndex}`}>
        <td
          colSpan={columnCount}
          style={{ height: (untilIndex - nextUnmountedIndex) * rowHeight }}
        />
      </tr>,
    );
  };

  for (const index of mountedIndexes) {
    addSpacerRow(index);
    bodyRows.push(renderTrackRow(index));
    nextUnmountedIndex = index + 1;
  }

  if (scrollContainer) addSpacerRow(items.length);

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
        <tbody className="before:table-row before:h-1">{bodyRows}</tbody>
      </table>
      {trackToAdd && (
        <AddToPlaylistDialog
          finalFocus={addToPlaylistTriggerRef}
          onCreatePlaylist={createPlaylistWithTrack}
          onOpenChange={setIsAddToPlaylistOpen}
          open={isAddToPlaylistOpen}
          track={trackToAdd}
        />
      )}
    </div>
  );
}

type TrackRowActions = {
  addToPlaylist: (track: Track, trigger: HTMLButtonElement) => void;
  addToQueue: (trackId: number) => void;
  createPlaylist: (track: Track) => void;
  keyDown: (event: KeyboardEvent<HTMLTableRowElement>, index: number) => void;
  play: (item: TrackListItem) => void;
  select: (sourceEntryId: number) => void;
  toggleLike: (track: Track) => void;
};

type TrackRowProps = {
  actions: TrackRowActions;
  artworkState: "playing" | "paused" | "selected" | undefined;
  canAddToQueue: boolean;
  index: number;
  isActive: boolean;
  isCreatingPlaylist: boolean;
  isPlaylist: boolean;
  isSelected: boolean;
  isTabStop: boolean;
  item: TrackListItem;
  renderMenuItems?: (item: TrackListItem) => ReactNode;
};

const TrackRow = memo(function TrackRow({
  actions,
  artworkState,
  canAddToQueue,
  index,
  isActive,
  isCreatingPlaylist,
  isPlaylist,
  isSelected,
  isTabStop,
  item,
  renderMenuItems,
}: TrackRowProps) {
  const track = item.track;
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
      onClick={() => actions.select(item.sourceEntryId)}
      onDoubleClick={() => actions.play(item)}
      onKeyDown={(event) => actions.keyDown(event, index)}
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
            state={artworkState}
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
              canAddToQueue={canAddToQueue}
              isCreatingPlaylist={isCreatingPlaylist}
              onAddToQueue={() => actions.addToQueue(track.id)}
              onAddToPlaylist={actions.addToPlaylist}
              onCreatePlaylist={actions.createPlaylist}
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
        <LikeButton
          className={cn(
            "-m-1",
            track.likedAt === null &&
              "opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100",
          )}
          label={track.likedAt === null ? `Like ${track.title}` : `Unlike ${track.title}`}
          liked={track.likedAt !== null}
          onToggle={() => actions.toggleLike(track)}
          tabIndex={isTabStop ? 0 : -1}
        />
      </td>
      <td className={cn("pr-4 pl-4 text-right font-mono text-meta tabular-nums", metadataColor)}>
        {formatDuration(track.duration)}
      </td>
    </tr>
  );
});

// Functions that keep their identity across renders but always call the latest ones passed in
function useStableActions<Actions extends Record<string, (...args: never[]) => void>>(
  actions: Actions,
) {
  const latest = useRef(actions);

  useLayoutEffect(() => {
    latest.current = actions;
  });

  const [stable] = useState(
    () =>
      // SAFETY: one wrapper per key of `actions`, each with the same signature as the original.
      Object.fromEntries(
        Object.keys(actions).map((name) => [
          name,
          (...args: never[]) => latest.current[name](...args),
        ]),
      ) as Actions,
  );

  return stable;
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
