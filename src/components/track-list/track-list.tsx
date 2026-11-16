import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePlayback } from "@/hooks/use-playback";
import { isEditableElement } from "@/lib/keyboard-shortcuts";
import type { PlayableSource } from "@/lib/queue/model";
import { sessionSource } from "@/lib/queue/source";
import { showTruncatedText } from "@/lib/show-truncated-text";
import type { SortField, TrackRow as TrackListItem, TrackSort } from "@/lib/track-sort";
import { isListBackgroundPointerDown } from "@/components/track-list/list-background-pointer";
import { FloatingSelectionBar } from "@/components/track-list/selection/selection-bar";
import {
  matchSelectionShortcut,
  type SelectionAction,
} from "@/components/track-list/selection/selection-shortcuts";
import { useTrackActions } from "@/components/track-list/actions/track-actions";
import { TrackListBody, type TrackListBodyHandle } from "@/components/track-list/track-list-body";
import { TrackListHead } from "@/components/track-list/track-list-head";
import { TrackRow, type TrackRowActions } from "@/components/track-list/track-row";
import {
  captureSelectionInDisplayedOrder,
  type NavigationKey,
  type RowMenuTrigger,
  summarizeSelection,
  useTrackSelection,
} from "@/components/track-list/selection/track-selection";

type TrackListProps = {
  caption: string;
  items: readonly TrackListItem[];
  source: PlayableSource;
  filter: string | null;
  sort: TrackSort;
  onStepSort: (field: SortField) => void;
  onReady?: (list: HTMLElement) => void;
  children?: ReactNode;
};

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

const popupRoles = "[role='menu'], [role='dialog'], [role='alertdialog']";

export function TrackList({
  caption,
  items,
  source,
  filter,
  sort,
  onStepSort,
  onReady,
  children,
}: TrackListProps) {
  const { activeSourceEntryId, activeSourcePlaylistId, isPlaying, playSourceEntry, queue } =
    usePlayback();

  const canQueue = queue !== null;
  const [selection, dispatchSelection] = useTrackSelection({ context: source, rows: items });
  const bodyRef = useRef<TrackListBodyHandle>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const listOwnsFocusRef = useRef(false);
  const { playlistPicker, run } = useTrackActions(source);
  const playlistId = source.kind === "playlist" ? source.playlistId : null;
  const playlistTitle = source.kind === "playlist" ? source.title : null;
  const isPlaylist = playlistId !== null;

  useLayoutEffect(() => {
    bodyRef.current?.scrollToTop();
  }, [sort]);

  const runOnSelection = (kind: SelectionAction) => {
    const target = captureSelectionInDisplayedOrder(selection);

    if (!target) return false;

    run({ kind, target });

    return true;
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
  const summary = summarizeSelection(selection);
  const showsBar = summary.count >= 2;
  const [lastInput, setLastInput] = useState<"keyboard" | "pointer">("pointer");

  useEffect(() => {
    const followFocus = (event: FocusEvent) => {
      const target = event.target;

      if (!(target instanceof Element) || target.closest(popupRoles)) return;

      listOwnsFocusRef.current = regionRef.current?.contains(target) ?? false;
    };

    document.addEventListener("focusin", followFocus);

    return () => document.removeEventListener("focusin", followFocus);
  }, []);

  useLayoutEffect(() => {
    if (!listOwnsFocusRef.current || tabStopEntryId === undefined) return;

    const active = document.activeElement;
    const focusIsLost = !active || active === document.body;

    const focusIsOnAnotherRow =
      active instanceof HTMLTableRowElement &&
      regionRef.current?.contains(active) &&
      active.dataset.entryId !== String(tabStopEntryId);

    const focusIsInHiddenToolbar =
      !showsBar && regionRef.current?.querySelector("[role='toolbar']")?.contains(active);

    if (focusIsLost || focusIsOnAnotherRow || focusIsInHiddenToolbar) {
      bodyRef.current?.focusRow(tabStopIndex, tabStopEntryId);
    }
  }, [items, showsBar, tabStopEntryId, tabStopIndex]);

  const isSelectedAt = (index: number) => {
    const item = items[index];

    return item !== undefined && selectedIds.has(item.sourceEntryId);
  };

  const entryIdOfRow = (row: Element | null, region: Element) => {
    if (!(row instanceof HTMLTableRowElement) || !region.contains(row)) return null;

    const entryId = Number(row.dataset.entryId);

    return indexById.has(entryId) ? entryId : null;
  };

  const openMenu = (entryId: number, trigger: RowMenuTrigger) =>
    dispatchSelection({ entryId, trigger, type: "openMenu" });

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

    const shortcut = isEditableElement(target)
      ? null
      : matchSelectionShortcut(event, isMac, { playlist: isPlaylist, queue: canQueue });

    if (shortcut) {
      if (event.repeat || runOnSelection(shortcut)) event.preventDefault();

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

  // Every mounted row receives these actions. If they read `items`, the compiler rebuilds them on
  // every library change and a like re-renders every row.
  const rowActions: TrackRowActions = {
    closeMenu: (entryId, trigger) => dispatchSelection({ entryId, trigger, type: "closeMenu" }),
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
        canQueue={canQueue}
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
      className="relative flex min-h-0 flex-1 flex-col"
      onKeyDown={handleListKeyDown}
      onKeyDownCapture={() => setLastInput("keyboard")}
      onPointerDownCapture={() => setLastInput("pointer")}
      ref={regionRef}
    >
      <div
        className="min-h-0 flex-1 scroll-pb-18 overflow-y-auto scroll-area-scrollbar scroll-mask-end"
        data-scroll-container
        onPointerDown={(event) => {
          if (isListBackgroundPointerDown(event)) dispatchSelection({ type: "clear" });
        }}
      >
        <div className="@container pb-18">
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
          {children}
        </div>
      </div>
      <FloatingSelectionBar
        allLiked={summary.allLiked}
        canQueue={canQueue}
        canRemove={isPlaylist}
        count={summary.count}
        duration={summary.duration}
        lastInput={lastInput}
        onAction={runOnSelection}
        onClear={() => dispatchSelection({ type: "clear" })}
        shown={showsBar}
      />
      {playlistPicker}
    </div>
  );
}
