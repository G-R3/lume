import {
  type KeyboardEvent,
  type MouseEvent,
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
import { showTruncatedText } from "@/lib/show-truncated-text";
import type { SortField, TrackRow as TrackListItem, TrackSort } from "@/lib/track-sort";
import { cn } from "@/lib/utils";
import { FloatingSelectionBar, type SelectionBarAction } from "@/pages/tracks/selection-bar";
import { focusReturnTarget, type TrackAction, useTrackActions } from "@/pages/tracks/track-actions";
import { TrackListBody, type TrackListBodyHandle } from "@/pages/tracks/track-list-body";
import { TrackListHead } from "@/pages/tracks/track-list-head";
import { TrackRow, type TrackRowActions } from "@/pages/tracks/track-row";
import {
  captureSelectionInDisplayedOrder,
  type NavigationKey,
  type RowMenuTrigger,
  summarizeSelection,
  useTrackSelection,
} from "@/pages/tracks/track-selection";

export type TrackListHandle = { clearSelection: () => void };

type TrackListProps = {
  caption: string;
  items: readonly TrackListItem[];
  source: PlayableSource;
  filter: string | null;
  sort: TrackSort;
  onStepSort: (field: SortField) => void;
  onReady?: (list: HTMLElement) => void;
  ref?: Ref<TrackListHandle>;
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
  const { activeSourceEntryId, activeSourcePlaylistId, isPlaying, playSourceEntry, queue } =
    usePlayback();

  const canAddToQueue = queue !== null;
  const menuReturnsFocusRef = useRef(false);
  const [selection, dispatchSelection] = useTrackSelection({ context: source, rows: items });
  const bodyRef = useRef<TrackListBodyHandle>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const listOwnsFocusRef = useRef(false);
  const { openCreation, playlistPicker, run: runAction } = useTrackActions(source, regionRef);
  const playlistId = source.kind === "playlist" ? source.playlistId : null;
  const playlistTitle = source.kind === "playlist" ? source.title : null;
  const isPlaylist = playlistId !== null;

  useLayoutEffect(() => {
    bodyRef.current?.scrollToTop();
  }, [sort]);

  const run = (action: TrackAction) => {
    // The dialog takes focus next, so the closing row menu must not pull focus back to its row.
    if (action.kind === "addToPlaylist" || action.kind === "createPlaylist") {
      menuReturnsFocusRef.current = false;
    }

    runAction(action);
  };

  const runOnSelection = (kind: SelectionBarAction) => {
    const target = captureSelectionInDisplayedOrder(selection);

    if (!target) return;

    if (kind === "addToPlaylist" || kind === "createPlaylist") {
      run({ kind, returnTo: "toolbar", target });
    } else {
      run({ kind, target });
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
  const summary = summarizeSelection(selection);
  const showsBar = summary.count >= 2;
  const [lastInput, setLastInput] = useState<"keyboard" | "pointer">("pointer");

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

  useLayoutEffect(() => {
    if (showsBar || !listOwnsFocusRef.current || tabStopEntryId === undefined) return;

    const active = document.activeElement;
    const toolbar = regionRef.current?.querySelector("[role='toolbar']");

    if (!active || active === document.body || toolbar?.contains(active)) {
      bodyRef.current?.focusRow(tabStopIndex, tabStopEntryId);
    }
  }, [showsBar, tabStopEntryId, tabStopIndex]);

  const isSelectedAt = (index: number) => {
    const item = items[index];

    return item !== undefined && selectedIds.has(item.sourceEntryId);
  };

  const entryIdOfRow = (row: Element | null, region: Element) => {
    if (!(row instanceof HTMLTableRowElement) || !region.contains(row)) return null;

    const entryId = Number(row.dataset.entryId);

    return indexById.has(entryId) ? entryId : null;
  };

  const openMenu = (entryId: number, trigger: RowMenuTrigger) => {
    menuReturnsFocusRef.current = true;
    dispatchSelection({ entryId, trigger, type: "openMenu" });
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

  // Every mounted row receives these actions. If they read `items`, the compiler rebuilds them on
  // every library change and a like re-renders every row.
  const rowActions: TrackRowActions = {
    closeMenu: (entryId, trigger, reason) => {
      if (reason === "outside-press" || reason === "focus-out") menuReturnsFocusRef.current = false;

      dispatchSelection({ entryId, trigger, type: "closeMenu" });
    },
    menuFinalFocus: (entryId) => {
      const active = document.activeElement;
      const focusMovedOn = active && active !== document.body && !active.closest("[role='menu']");

      return menuReturnsFocusRef.current && !focusMovedOn
        ? focusReturnTarget(regionRef.current, entryId)
        : false;
    },
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
      className={cn("@container", showsBar && "pb-24")}
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
      onKeyDownCapture={() => setLastInput("keyboard")}
      onPointerDownCapture={() => setLastInput("pointer")}
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
      <FloatingSelectionBar
        allLiked={summary.allLiked}
        canAddToQueue={canAddToQueue}
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
