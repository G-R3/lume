import { ContextMenu } from "@base-ui/react/context-menu";
import { DotsThreeIcon, ListPlusIcon, PlaylistIcon, PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePlayback } from "@/hooks/use-playback";
import type { PlayableSource } from "@/lib/queue/commands";
import { sessionSource } from "@/lib/queue/source";
import type { Track } from "../../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { LikeButton } from "@/components/like-button";
import { SortArrow } from "@/components/sort-arrow";
import { type ArtworkState, TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { formatAddedDate } from "@/lib/format-added-date";
import { formatDuration } from "@/lib/format-duration";
import { showTruncatedText } from "@/lib/show-truncated-text";
import { useSetTrackLiked } from "@/lib/library-query";
import { useCreatePlaylistFromTrackMutation } from "@/lib/playlist-mutations";
import {
  sortFieldInfo,
  sortName,
  type SortField,
  type TrackRow,
  type TrackSort,
} from "@/lib/track-sort";
import { cn } from "@/lib/utils";

type TrackListProps = {
  caption: string;
  items: readonly TrackRow[];
  source: PlayableSource;
  filter: string | null;
  sort: TrackSort;
  onStepSort: (field: SortField) => void;
  onReady?: (list: HTMLElement) => void;
  renderMenuItems?: (item: TrackRow) => ReactNode;
};

const rowHeight = 40;

const headerHeight = 32;

const listInset = 4;

export function TrackList({
  caption,
  items,
  source,
  filter,
  sort,
  onStepSort,
  renderMenuItems,
  onReady,
}: TrackListProps) {
  const {
    activeSourceEntryId,
    activeSourcePlaylistId,
    enqueueTrack,
    isPlaying,
    playSourceEntry,
    queue,
  } = usePlayback();

  const canAddToQueue = queue !== null;

  const navigate = useNavigate();

  const { isPending: isCreatingPlaylist, mutate: createPlaylistFromTrack } =
    useCreatePlaylistFromTrackMutation();

  const { mutate: setTrackLiked } = useSetTrackLiked();
  const addToPlaylistTriggerRef = useRef<HTMLElement | null>(null);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const bodyRef = useRef<TrackListBodyHandle>(null);
  const playlistId = source.kind === "playlist" ? source.playlistId : null;
  const isPlaylist = playlistId !== null;

  useLayoutEffect(() => {
    bodyRef.current?.scrollToTop();
  }, [sort]);

  const openAddToPlaylist = (track: Track, trigger: HTMLButtonElement) => {
    addToPlaylistTriggerRef.current = trigger;
    setTrackToAdd(track);
    setIsAddToPlaylistOpen(true);
  };

  const createPlaylistWithTrack = (track: Track) => {
    createPlaylistFromTrack(track.id, {
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
    setTrackLiked(
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

  const playRowAt = (index: number) => {
    const item = items[index];

    if (!item?.track.available) return;

    playSourceEntry(sessionSource(source, items, filter, sort), item.sourceEntryId);
  };

  const indexOfRow = (row: Element | null) =>
    row instanceof HTMLTableRowElement
      ? items.findIndex((item) => String(item.sourceEntryId) === row.dataset.entryId)
      : -1;

  const selectedIndex = items.findIndex((item) => item.sourceEntryId === selectedEntryId);
  const tabStopIndex = items.length ? Math.max(0, selectedIndex) : -1;
  const tabStopEntryId = items[tabStopIndex]?.sourceEntryId;

  const selectAndFocusRow = (index: number) => {
    const target = Math.max(0, Math.min(items.length - 1, index));
    const item = items[target];

    if (!item) return;

    setSelectedEntryId(item.sourceEntryId);
    bodyRef.current?.focusRow(target, item.sourceEntryId);
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const index = indexOfRow(event.target instanceof Element ? event.target : null);

    if (index < 0) return;

    const pageSize = bodyRef.current?.rowsPerPage() ?? 1;

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
      selectAndFocusRow(target);

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      playRowAt(index);
    }
  };

  const handleGridDoubleClick = (event: MouseEvent<HTMLTableElement>) => {
    const row = event.target instanceof Element ? event.target.closest("tr[data-entry-id]") : null;
    const index = indexOfRow(row);

    if (index >= 0) playRowAt(index);
  };

  // Every mounted row receives these actions and `renderMenuItems`. If either reads `items`, the
  // compiler rebuilds it on every library change and a like re-renders every row.
  const rowActions: TrackRowActions = {
    addToPlaylist: openAddToPlaylist,
    addToQueue: enqueueTrack,
    createPlaylist: createPlaylistWithTrack,
    select: setSelectedEntryId,
    toggleLike: toggleTrackLiked,
  };

  function renderTrackRow(index: number) {
    const item = items[index];

    const isActive =
      activeSourceEntryId === item.sourceEntryId && activeSourcePlaylistId === playlistId;

    const isSelected = item.sourceEntryId === selectedEntryId;

    return (
      <TrackRow
        actions={rowActions}
        artworkState={isActive ? (isPlaying ? "playing" : "paused") : undefined}
        canAddToQueue={canAddToQueue}
        index={index}
        isActive={isActive}
        isCreatingPlaylist={isCreatingPlaylist}
        isPlaylist={isPlaylist}
        isSelected={isSelected}
        isTabStop={item.sourceEntryId === tabStopEntryId}
        addedToListAt={item.addedToListAt}
        key={item.sourceEntryId}
        renderMenuItems={renderMenuItems}
        sourceEntryId={item.sourceEntryId}
        track={item.track}
      />
    );
  }

  return (
    <div className="@container">
      <table
        className="w-full table-fixed border-separate border-spacing-0 px-2 select-none"
        onDoubleClick={handleGridDoubleClick}
        onKeyDown={handleGridKeyDown}
        onPointerOver={showTruncatedText}
        aria-rowcount={items.length + 1}
        role="grid"
      >
        <caption className="sr-only">{caption}</caption>
        <TrackListHead isPlaylist={isPlaylist} onStepSort={onStepSort} sort={sort} />
        <TrackListBody
          count={items.length}
          onReady={onReady}
          pinnedIndex={tabStopIndex}
          ref={bodyRef}
          renderRow={renderTrackRow}
        />
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

type TrackListBodyHandle = {
  focusRow: (index: number, sourceEntryId: number) => void;
  rowsPerPage: () => number;
  scrollToTop: () => void;
};

type TrackListBodyProps = {
  count: number;
  onReady?: (list: HTMLElement) => void;
  pinnedIndex: number;
  ref: Ref<TrackListBodyHandle>;
  renderRow: (index: number) => ReactNode;
};

// The React Compiler skips any component that calls `useVirtualizer`, so the virtualizer lives
// here, apart from TrackList.
function TrackListBody({ count, onReady, pinnedIndex, ref, renderRow }: TrackListBodyProps) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const pendingFocusEntryId = useRef<number | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const table = bodyRef.current?.closest("table");
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

  const virtualizer = useVirtualizer({
    count,
    enabled: Boolean(scrollContainer),
    estimateSize: () => rowHeight,
    getScrollElement: () => scrollContainer,
    overscan: 8,
    paddingStart: headerHeight + listInset,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);

      return pinnedIndex < 0 || indexes.includes(pinnedIndex)
        ? indexes
        : [...indexes, pinnedIndex].sort((left, right) => left - right);
    },
    scrollMargin,
    scrollPaddingStart: headerHeight + listInset,
  });

  const mountedIndexes = scrollContainer
    ? virtualizer.getVirtualItems().map((virtualItem) => virtualItem.index)
    : [];

  const hasMountedRows = mountedIndexes.length > 0;

  useLayoutEffect(() => {
    const table = bodyRef.current?.closest("table");

    if (hasMountedRows && table) onReady?.(table);
  }, [hasMountedRows, onReady]);

  const focusPendingRow = () => {
    const entryId = pendingFocusEntryId.current;

    if (entryId === null) return;

    const row = bodyRef.current?.querySelector<HTMLElement>(`tr[data-entry-id="${entryId}"]`);

    if (!row) return;

    pendingFocusEntryId.current = null;
    row.focus({ preventScroll: true });
  };

  useImperativeHandle(ref, () => ({
    focusRow: (index, sourceEntryId) => {
      pendingFocusEntryId.current = sourceEntryId;
      virtualizer.scrollToIndex(index);
      focusPendingRow();
    },
    rowsPerPage: () =>
      Math.max(1, Math.floor((scrollContainer?.clientHeight ?? 0) / rowHeight) - 1),
    scrollToTop: () => scrollContainer?.scrollTo({ top: 0 }),
  }));

  useLayoutEffect(focusPendingRow);

  const bodyRows: ReactNode[] = [];
  let nextUnmountedIndex = 0;

  const addSpacerRow = (untilIndex: number) => {
    if (untilIndex <= nextUnmountedIndex) return;

    bodyRows.push(
      <tr aria-hidden="true" key={`spacer-${nextUnmountedIndex}`}>
        <td style={{ height: (untilIndex - nextUnmountedIndex) * rowHeight }} />
      </tr>,
    );
  };

  for (const index of mountedIndexes) {
    addSpacerRow(index);
    bodyRows.push(renderRow(index));
    nextUnmountedIndex = index + 1;
  }

  if (scrollContainer) addSpacerRow(count);

  return (
    <tbody className="before:table-row before:h-1" ref={bodyRef}>
      {bodyRows}
    </tbody>
  );
}

type TrackRowActions = {
  addToPlaylist: (track: Track, trigger: HTMLButtonElement) => void;
  addToQueue: (trackId: number) => void;
  createPlaylist: (track: Track) => void;
  select: (sourceEntryId: number) => void;
  toggleLike: (track: Track) => void;
};

type TrackRowProps = {
  actions: TrackRowActions;
  addedToListAt: number;
  artworkState: ArtworkState | undefined;
  canAddToQueue: boolean;
  index: number;
  isActive: boolean;
  isCreatingPlaylist: boolean;
  isPlaylist: boolean;
  isSelected: boolean;
  isTabStop: boolean;
  renderMenuItems?: (item: TrackRow) => ReactNode;
  sourceEntryId: number;
  track: Track;
};

const TrackRow = memo(function TrackRow({
  actions,
  addedToListAt,
  artworkState,
  canAddToQueue,
  index,
  isActive,
  isCreatingPlaylist,
  isPlaylist,
  isSelected,
  isTabStop,
  renderMenuItems,
  sourceEntryId,
  track,
}: TrackRowProps) {
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const menuItems = (
    <TrackRowMenuItems
      canAddToQueue={canAddToQueue}
      isCreatingPlaylist={isCreatingPlaylist}
      onAddToQueue={() => actions.addToQueue(track.id)}
      onAddToPlaylist={() => {
        if (menuTriggerRef.current) actions.addToPlaylist(track, menuTriggerRef.current);
      }}
      onCreatePlaylist={() => actions.createPlaylist(track)}
    >
      {renderMenuItems?.({ sourceEntryId, track, addedToListAt })}
    </TrackRowMenuItems>
  );

  const metadataColor = track.available ? "text-secondary" : "text-disabled";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <tr
            aria-current={isActive ? "true" : undefined}
            aria-rowindex={index + 2}
            aria-selected={isSelected}
            className={cn(
              "group/track-row cursor-default rounded-md focus-visible:-outline-offset-2 *:h-10 *:first:rounded-l-md *:last:rounded-r-md",
              isSelected ? "*:bg-selected" : "hover:*:bg-hover",
            )}
            data-entry-id={sourceEntryId}
            onClick={() => actions.select(sourceEntryId)}
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
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={`More options for ${track.title}`}
                      className="opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100 data-popup-open:opacity-100"
                      onMouseDown={(event) => event.preventDefault()}
                      ref={menuTriggerRef}
                      size="icon-sm"
                      static
                      tabIndex={isTabStop ? 0 : -1}
                      variant="row-action"
                    />
                  }
                >
                  <DotsThreeIcon aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
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
            onToggle={() => actions.toggleLike(track)}
            tabIndex={isTabStop ? 0 : -1}
          />
        </td>
        <td className={cn("pr-4 pl-4 text-right font-mono text-meta tabular-nums", metadataColor)}>
          {formatDuration(track.duration)}
        </td>
      </ContextMenu.Trigger>
      <DropdownMenuContent side="right" sideOffset={0}>
        {menuItems}
      </DropdownMenuContent>
    </ContextMenu.Root>
  );
});

function TrackListHead({
  isPlaylist,
  onStepSort,
  sort,
}: {
  isPlaylist: boolean;
  onStepSort?: (field: SortField) => void;
  sort: TrackSort;
}) {
  return (
    <thead className="sticky top-0 z-10 text-left font-mono text-meta text-secondary">
      <tr
        aria-rowindex={1}
        className="*:bg-page *:first:relative *:first:before:absolute *:first:before:top-0 *:first:before:right-full *:first:before:-bottom-px *:first:before:w-2 *:first:before:border-b *:first:before:border-separator *:first:before:bg-page *:last:relative *:last:after:absolute *:last:after:top-0 *:last:after:-bottom-px *:last:after:left-full *:last:after:w-2 *:last:after:border-b *:last:after:border-separator *:last:after:bg-page"
      >
        {isPlaylist && (
          <th className="h-8 w-10 border-b border-separator pl-4 font-normal" scope="col">
            #
          </th>
        )}
        <SortableHeader buttonClassName="pl-14" field="title" onStepSort={onStepSort} sort={sort} />
        <SortableHeader
          buttonClassName="pl-4"
          className="hidden w-[30%] @3xl:table-cell @6xl:w-100"
          field="album"
          onStepSort={onStepSort}
          sort={sort}
        />
        <SortableHeader
          buttonClassName="pl-4"
          className="hidden w-36 @3xl:table-cell"
          field="added"
          onStepSort={onStepSort}
          sort={sort}
        />
        <th className="h-8 w-8 border-b border-separator font-normal" scope="col">
          <span className="sr-only">Like</span>
        </th>
        <SortableHeader
          buttonClassName="flex-row-reverse px-4"
          className="w-28"
          field="duration"
          onStepSort={onStepSort}
          sort={sort}
        />
      </tr>
    </thead>
  );
}

function SortableHeader({
  buttonClassName,
  className,
  field,
  onStepSort,
  sort,
}: {
  buttonClassName: string;
  className?: string;
  field: SortField;
  onStepSort?: (field: SortField) => void;
  sort: TrackSort;
}) {
  const direction = sort.field === field ? sort.direction : null;

  return (
    <th
      aria-sort={direction === null ? undefined : direction === "asc" ? "ascending" : "descending"}
      className={cn("h-8 border-b border-separator p-0 font-normal", className)}
      scope="col"
    >
      <button
        aria-label={sortName(sort, field)}
        className={cn(
          "group/sort flex h-8 w-full cursor-pointer items-center gap-1 focus-visible:-outline-offset-2",
          direction === null
            ? "text-secondary hover:text-primary focus-visible:text-primary"
            : "text-primary",
          buttonClassName,
        )}
        onClick={() => onStepSort?.(field)}
        type="button"
      >
        {sortFieldInfo(field).label}
        <SortArrow direction={direction} />
      </button>
    </th>
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

export function TrackListSkeleton({ isPlaylist, sort }: { isPlaylist: boolean; sort: TrackSort }) {
  return (
    <div aria-hidden="true" className="@container" inert>
      <table className="w-full table-fixed border-separate border-spacing-0 px-2 select-none">
        <TrackListHead isPlaylist={isPlaylist} sort={sort} />
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

function TrackRowMenuItems({
  canAddToQueue,
  children,
  isCreatingPlaylist,
  onAddToQueue,
  onAddToPlaylist,
  onCreatePlaylist,
}: {
  canAddToQueue: boolean;
  children?: ReactNode;
  isCreatingPlaylist: boolean;
  onAddToQueue: () => void;
  onAddToPlaylist: () => void;
  onCreatePlaylist: () => void;
}) {
  return (
    <>
      {canAddToQueue && (
        <>
          <DropdownMenuItem onClick={onAddToQueue}>
            <ListPlusIcon aria-hidden="true" />
            Add to queue
            <DropdownMenuShortcut aria-hidden="true" className="pl-2">
              Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={onAddToPlaylist}>
        <PlaylistIcon aria-hidden="true" />
        Add to playlist…
        <DropdownMenuShortcut aria-hidden="true" className="pl-2">
          P
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={isCreatingPlaylist} onClick={onCreatePlaylist}>
        <PlusIcon aria-hidden="true" />
        New playlist from track
      </DropdownMenuItem>
      {children && (
        <>
          <DropdownMenuSeparator />
          {children}
        </>
      )}
    </>
  );
}
