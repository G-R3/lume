import { ContextMenu } from "@base-ui/react/context-menu";
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
import { isEditableElement } from "@/lib/keyboard-shortcuts";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { formatAddedDate } from "@/lib/format-added-date";
import { formatDuration } from "@/lib/format-duration";
import { showTruncatedText } from "@/lib/show-truncated-text";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useSetTracksLiked } from "@/lib/library-query";
import { useRemovePlaylistTracksMutation } from "@/lib/playlist-mutations";
import {
  sortFieldInfo,
  sortName,
  type SortField,
  type TrackRow,
  type TrackSort,
} from "@/lib/track-sort";
import { cn } from "@/lib/utils";
import {
  type ActionTarget,
  captureSelectionInDisplayedOrder,
  type NavigationKey,
  type RowMenu,
  type RowMenuTrigger,
  type TargetEntry,
  useTrackSelection,
} from "@/pages/tracks/track-selection";

export type TrackListHandle = { clearSelection: () => void };

type TrackListProps = {
  caption: string;
  items: readonly TrackRow[];
  source: PlayableSource;
  filter: string | null;
  sort: TrackSort;
  onStepSort: (field: SortField) => void;
  onReady?: (list: HTMLElement) => void;
  ref?: Ref<TrackListHandle>;
};

type TrackAction =
  | { kind: "queue"; target: ActionTarget }
  | { kind: "like"; target: ActionTarget }
  | { kind: "addToPlaylist"; target: ActionTarget; returnTo: number | null }
  | { kind: "createPlaylist"; target: ActionTarget; returnTo: number | null }
  | { kind: "removeFromPlaylist"; target: ActionTarget };

type MenuCloseReason = Parameters<NonNullable<ContextMenu.Root.Props["onOpenChange"]>>[1]["reason"];

const navigationKeys: ReadonlySet<string> = new Set<NavigationKey>([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function isNavigationKey(key: string): key is NavigationKey {
  return navigationKeys.has(key);
}

function rowOf(target: EventTarget) {
  return target instanceof Element ? target.closest("tr[data-entry-id]") : null;
}

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
  onReady,
  ref,
}: TrackListProps) {
  const {
    activeSourceEntryId,
    activeSourcePlaylistId,
    enqueueTracks,
    isPlaying,
    playSourceEntry,
    queue,
  } = usePlayback();

  const canAddToQueue = queue !== null;

  const { mutate: setTracksLiked } = useSetTracksLiked();
  const { mutateAsync: removePlaylistTracks } = useRemovePlaylistTracksMutation();
  const openPlaylistCreation = usePlaylistCreation();

  const [picker, setPicker] = useState<{
    open: boolean;
    returnTo: number | null;
    target: ActionTarget;
  } | null>(null);

  const pickerHandedOffRef = useRef(false);
  const menuReturnsFocusRef = useRef(false);
  const [selection, dispatchSelection] = useTrackSelection({ context: source, rows: items });
  const bodyRef = useRef<TrackListBodyHandle>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const listOwnsFocusRef = useRef(false);
  const playlistId = source.kind === "playlist" ? source.playlistId : null;
  const playlistTitle = source.kind === "playlist" ? source.title : null;
  const isPlaylist = playlistId !== null;

  useLayoutEffect(() => {
    bodyRef.current?.scrollToTop();
  }, [sort]);

  const returnFocusTo = (entryId: number | null) => () => {
    const region = regionRef.current;

    if (!region?.isConnected) return false;

    return (
      region.querySelector<HTMLElement>(`tr[data-entry-id="${entryId}"]`) ??
      region.querySelector<HTMLElement>("tr[data-entry-id][tabindex='0']") ??
      false
    );
  };

  const openCreation = (target: ActionTarget, returnTo: number | null) =>
    openPlaylistCreation({ finalFocus: returnFocusTo(returnTo), target });

  const run = (action: TrackAction) => {
    const { target } = action;
    const count = target.entries.length;

    switch (action.kind) {
      case "queue":
        enqueueTracks(target.entries.map((entry) => entry.trackId));

        return;
      case "like":
        setTracksLiked(
          {
            liked: target.entries.some((entry) => !entry.liked),
            trackIds: target.entries.map((entry) => entry.trackId),
          },
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

        return;
      case "addToPlaylist":
        menuReturnsFocusRef.current = false;
        pickerHandedOffRef.current = false;
        setPicker({ open: true, returnTo: action.returnTo, target });

        return;
      case "createPlaylist":
        menuReturnsFocusRef.current = false;
        openCreation(target, action.returnTo);

        return;
      case "removeFromPlaylist": {
        if (target.context.kind !== "playlist") return;

        const title = playlistTitle ?? "playlist";

        // Removing every row unmounts this list, which drops per-call mutate callbacks.
        removePlaylistTracks({
          playlistId: target.context.playlistId,
          playlistTrackIds: target.entries.map((entry) => entry.sourceEntryId),
        }).then(
          () => {
            toast.add({
              title:
                count === 1
                  ? `Removed from ${title}`
                  : `Removed ${count.toLocaleString()} tracks from ${title}`,
              type: "success",
            });
          },
          (error: Error) => {
            toast.add({
              description: error.message,
              priority: "high",
              title:
                count === 1
                  ? "Could not remove track from playlist"
                  : "Could not remove tracks from playlist",
              type: "error",
            });
          },
        );
      }
    }
  };

  const playRowAt = (index: number) => {
    const item = items[index];

    if (!item?.track.available) return;

    playSourceEntry(sessionSource(source, items, filter, sort), item.sourceEntryId);
  };

  const { indexById, selectedIds, focusedId } = selection;
  const focusedIndex = focusedId === null ? -1 : (indexById.get(focusedId) ?? -1);
  const tabStopIndex = items.length ? Math.max(0, focusedIndex) : -1;
  const tabStopEntryId = items[tabStopIndex]?.sourceEntryId;

  useImperativeHandle(ref, () => ({
    clearSelection: () => dispatchSelection({ type: "clear" }),
  }));

  useLayoutEffect(() => {
    if (!listOwnsFocusRef.current || focusedId === null || focusedIndex < 0) return;

    const active = document.activeElement;
    const focusIsLost = !active || active === document.body;

    const focusIsOnAnotherRow =
      active instanceof HTMLTableRowElement &&
      regionRef.current?.contains(active) &&
      active.dataset.entryId !== String(focusedId);

    if (focusIsLost || focusIsOnAnotherRow) bodyRef.current?.focusRow(focusedIndex, focusedId);
  }, [focusedId, focusedIndex, items]);

  const isSelectedAt = (index: number) => {
    const item = items[index];

    return item !== undefined && selectedIds.has(item.sourceEntryId);
  };

  const entryIdOfRow = (row: Element | null, region: Element) => {
    if (!(row instanceof HTMLTableRowElement) || !region.contains(row)) return null;

    const entryId = Number(row.dataset.entryId);

    return indexById.has(entryId) ? entryId : null;
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;

    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      !(target instanceof Element) ||
      !event.currentTarget.contains(target)
    ) {
      return;
    }

    const isMac = window.lume.isMac;
    const hasPrimary = isMac ? event.metaKey : event.ctrlKey;
    const hasSecondary = isMac ? event.ctrlKey : event.metaKey;
    const hasOnlyPrimary = hasPrimary && !hasSecondary && !event.shiftKey && !event.altKey;
    const hasNoModifiers = !event.metaKey && !event.ctrlKey && !event.altKey;

    if (event.key.toLowerCase() === "a" && hasOnlyPrimary && !isEditableElement(target)) {
      event.preventDefault();
      dispatchSelection({ type: "selectAll" });

      return;
    }

    if (
      event.key.toLowerCase() === "n" &&
      hasPrimary &&
      !hasSecondary &&
      event.shiftKey &&
      !event.altKey &&
      !isEditableElement(target)
    ) {
      const selected = captureSelectionInDisplayedOrder(selection);

      if (!selected) return;

      event.preventDefault();
      openCreation(selected, entryIdOfRow(target, event.currentTarget) ?? focusedId);

      return;
    }

    if (event.key === "Escape" && hasNoModifiers && !event.shiftKey) {
      if (isEditableElement(target) || selectedIds.size === 0) return;

      event.preventDefault();
      dispatchSelection({ type: "clear" });

      return;
    }

    const entryId = entryIdOfRow(target, event.currentTarget);

    if (entryId === null || !hasNoModifiers) return;

    if (
      (event.key === "ContextMenu" && !event.shiftKey) ||
      (event.key === "F10" && event.shiftKey)
    ) {
      event.preventDefault();
      openMenu(entryId, "overflow");

      return;
    }

    if (isNavigationKey(event.key)) {
      event.preventDefault();
      dispatchSelection({
        extend: event.shiftKey,
        fromEntryId: entryId,
        key: event.key,
        pageSize: bodyRef.current?.rowsPerPage() ?? 1,
        type: "navigate",
      });

      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      playRowAt(indexById.get(entryId) ?? -1);
    }
  };

  const handleGridClick = (event: MouseEvent<HTMLTableElement>) => {
    const entryId = entryIdOfRow(rowOf(event.target), event.currentTarget);

    if (entryId === null) return;

    const isMac = window.lume.isMac;

    if (isMac && event.ctrlKey && !event.metaKey) return;

    const isToggle = isMac ? event.metaKey : event.ctrlKey;

    dispatchSelection({
      entryId,
      intent: event.shiftKey ? "range" : isToggle ? "toggle" : "replace",
      type: "click",
    });
  };

  const handleGridDoubleClick = (event: MouseEvent<HTMLTableElement>) => {
    const entryId = entryIdOfRow(rowOf(event.target), event.currentTarget);

    if (entryId !== null) playRowAt(indexById.get(entryId) ?? -1);
  };

  function openMenu(entryId: number, trigger: RowMenuTrigger) {
    menuReturnsFocusRef.current = true;
    dispatchSelection({ entryId, trigger, type: "openMenu" });
  }

  // Every mounted row receives these actions. If they read `items`, the compiler rebuilds them on
  // every library change and a like re-renders every row.
  const rowActions: TrackRowActions = {
    closeMenu: (entryId, trigger, reason) => {
      if (reason === "outside-press" || reason === "focus-out") menuReturnsFocusRef.current = false;

      dispatchSelection({ entryId, trigger, type: "closeMenu" });
    },
    menuFinalFocus: (entryId) => (menuReturnsFocusRef.current ? returnFocusTo(entryId)() : false),
    openMenu,
    run,
    toggleLike: (entry) => run({ kind: "like", target: { context: source, entries: [entry] } }),
  };

  function renderTrackRow(index: number) {
    const item = items[index];

    const isActive =
      activeSourceEntryId === item.sourceEntryId && activeSourcePlaylistId === playlistId;

    const isSelected = selectedIds.has(item.sourceEntryId);
    const menu = selection.menu?.entryId === item.sourceEntryId ? selection.menu : null;

    return (
      <TrackRow
        actions={rowActions}
        artworkState={isActive ? (isPlaying ? "playing" : "paused") : undefined}
        canAddToQueue={canAddToQueue}
        index={index}
        isActive={isActive}
        isSelected={isSelected}
        isSelectionEnd={isSelected && !isSelectedAt(index + 1)}
        isSelectionStart={isSelected && !isSelectedAt(index - 1)}
        isTabStop={item.sourceEntryId === tabStopEntryId}
        addedToListAt={item.addedToListAt}
        key={item.sourceEntryId}
        menuTarget={menu}
        playlistTitle={playlistTitle}
        sourceEntryId={item.sourceEntryId}
        track={item.track}
      />
    );
  }

  return (
    <div
      className="@container"
      onBlur={(event) => {
        const next = event.relatedTarget;

        if (next instanceof Node && !event.currentTarget.contains(next)) {
          listOwnsFocusRef.current = false;
        }
      }}
      onFocus={(event) => {
        if (event.currentTarget.contains(event.target)) listOwnsFocusRef.current = true;
      }}
      onKeyDown={handleListKeyDown}
      ref={regionRef}
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 px-2 select-none"
        onClick={handleGridClick}
        onDoubleClick={handleGridDoubleClick}
        onPointerOver={showTruncatedText}
        aria-multiselectable="true"
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
      {picker && (
        <AddToPlaylistDialog
          finalFocus={() => (pickerHandedOffRef.current ? false : returnFocusTo(picker.returnTo)())}
          onCreatePlaylist={(target) => {
            pickerHandedOffRef.current = true;
            openCreation(target, picker.returnTo);
          }}
          onOpenChange={(open) => setPicker((current) => current && { ...current, open })}
          open={picker.open}
          target={picker.target}
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
  closeMenu: (entryId: number, trigger: RowMenuTrigger, reason: MenuCloseReason) => void;
  menuFinalFocus: (entryId: number) => HTMLElement | false;
  openMenu: (entryId: number, trigger: RowMenuTrigger) => void;
  run: (action: TrackAction) => void;
  toggleLike: (entry: TargetEntry) => void;
};

type TrackRowProps = {
  actions: TrackRowActions;
  addedToListAt: number;
  artworkState: ArtworkState | undefined;
  canAddToQueue: boolean;
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

const TrackRow = memo(function TrackRow({
  actions,
  addedToListAt,
  artworkState,
  canAddToQueue,
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
      canAddToQueue={canAddToQueue}
      menu={menuTarget}
      playlistTitle={playlistTitle}
      run={actions.run}
    />
  );

  const menuProps = (trigger: RowMenuTrigger) => ({
    onOpenChange: (open: boolean, details: { reason: MenuCloseReason }) => {
      if (open) actions.openMenu(sourceEntryId, trigger);
      else actions.closeMenu(sourceEntryId, trigger, details.reason);
    },
    open: menuTarget?.open === true && menuTarget.trigger === trigger,
  });

  const menuFinalFocus = () => actions.menuFinalFocus(sourceEntryId);

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
                <DropdownMenuContent align="end" className="max-w-80" finalFocus={menuFinalFocus}>
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
      <DropdownMenuContent
        className="max-w-80"
        finalFocus={menuFinalFocus}
        side="right"
        sideOffset={0}
      >
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
        {targetsSelection && (
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
        )}
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
