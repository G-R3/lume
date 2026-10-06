import type { QueueCommand, QueueRandom } from "./commands";
import { activeSourceEntryId, clearItemAnchor, createSourceItems, isActivePlaylist } from "./items";
import type { QueueItem, QueueState, SourceEntry } from "./model";

type CommandOf<Type extends QueueCommand["type"]> = Extract<QueueCommand, { type: Type }>;

export function addSourceEntry(
  state: QueueState,
  { playlistId, entry, canonicalIndex = state.sourceEntries.length }: CommandOf<"sourceEntryAdded">,
  random: QueueRandom,
): QueueState {
  if (
    !isActivePlaylist(state, playlistId) ||
    state.sourceEntries.some((existing) => existing.sourceEntryId === entry.sourceEntryId) ||
    !Number.isInteger(canonicalIndex) ||
    canonicalIndex < 0 ||
    canonicalIndex > state.sourceEntries.length
  )
    return state;

  const sourceEntries = [...state.sourceEntries];
  sourceEntries.splice(canonicalIndex, 0, entry);

  const sourceQueue = [...state.sourceQueue];
  sourceQueue.splice(
    state.shuffleEnabled ? random.index(sourceQueue.length + 1) : sourceQueue.length,
    0,
    ...createSourceItems(state, [entry], state.sourceIdentity, state.sessionId),
  );

  return {
    ...state,
    sourceEntries,
    sourceQueue,
    sourcePosition:
      state.sourcePosition?.kind === "boundary" && canonicalIndex < state.sourcePosition.index
        ? { kind: "boundary", index: state.sourcePosition.index + 1 }
        : state.sourcePosition,
  };
}

/**
 * Removes a committed playlist entry from the source, upcoming items, and Previous history.
 * A current item for that entry keeps playing but leaves source navigation.
 */
export function removeSourceEntry(
  state: QueueState,
  { playlistId, sourceEntryId }: CommandOf<"sourceEntryRemoved">,
): QueueState {
  if (!isActivePlaylist(state, playlistId)) return state;

  const isRemovedEntry = (item: QueueItem) => activeSourceEntryId(state, item) === sourceEntryId;

  const removedIndex = state.sourceEntries.findIndex(
    (entry) => entry.sourceEntryId === sourceEntryId,
  );

  const currentRemoved =
    state.current?.participatesInSourceNavigation && isRemovedEntry(state.current.item);

  return {
    ...state,
    sourceEntries: state.sourceEntries.filter((entry) => entry.sourceEntryId !== sourceEntryId),
    sourcePosition:
      removedIndex === -1
        ? state.sourcePosition
        : state.sourcePosition?.kind === "entry" &&
            state.sourcePosition.sourceEntryId === sourceEntryId
          ? { kind: "boundary", index: removedIndex }
          : state.sourcePosition?.kind === "boundary" && removedIndex < state.sourcePosition.index
            ? { kind: "boundary", index: state.sourcePosition.index - 1 }
            : state.sourcePosition,
    current: state.current && {
      ...state.current,
      item: clearItemAnchor(state.current.item, sourceEntryId),
      participatesInSourceNavigation: currentRemoved
        ? false
        : state.current.participatesInSourceNavigation,
    },
    lastSelectedItem:
      state.lastSelectedItem && clearItemAnchor(state.lastSelectedItem, sourceEntryId),
    previousSourceItems: state.previousSourceItems
      .filter((item) => !isRemovedEntry(item))
      .map((item) => clearItemAnchor(item, sourceEntryId)),
    sourceQueue: state.sourceQueue
      .filter((item) => !isRemovedEntry(item))
      .map((item) => clearItemAnchor(item, sourceEntryId)),
    suppressedSourceEntryIds: state.suppressedSourceEntryIds.filter((id) => id !== sourceEntryId),
  };
}

// Stands in for the current position when the current item is not in source navigation.
const currentSlot = { kind: "current-slot" } as const;

type PathItem = QueueItem | typeof currentSlot;

/**
 * Moves a committed playlist entry. sourcePosition follows the move. Sequential playback also
 * moves the entry's queued visit, with its anchored queue-only items, without changing the current
 * item. Shuffled playback keeps its order.
 */
export function moveSourceEntry(
  state: QueueState,
  command: CommandOf<"sourceEntryMoved">,
): QueueState {
  if (
    !isActivePlaylist(state, command.playlistId) ||
    command.sourceEntryId === command.targetSourceEntryId
  )
    return state;

  const fromIndex = state.sourceEntries.findIndex(
    (entry) => entry.sourceEntryId === command.sourceEntryId,
  );

  const toIndex = command.orderedSourceEntryIds.indexOf(command.sourceEntryId);

  if (fromIndex === -1 || toIndex === -1) return state;
  const sourceEntries = reorderSourceEntries(state.sourceEntries, command.orderedSourceEntryIds);

  if (!sourceEntries) return state;

  const boundaryAfterRemoval =
    state.sourcePosition?.kind === "boundary"
      ? state.sourcePosition.index - Number(fromIndex < state.sourcePosition.index)
      : null;

  state = {
    ...state,
    sourceEntries,
    sourcePosition:
      boundaryAfterRemoval === null
        ? state.sourcePosition
        : {
            kind: "boundary",
            index: boundaryAfterRemoval + Number(toIndex < boundaryAfterRemoval),
          },
  };

  if (state.shuffleEnabled) return state;

  const current =
    state.current?.participatesInSourceNavigation && state.current.lane === "source"
      ? state.current.item
      : currentSlot;

  const path: PathItem[] = [...state.previousSourceItems, current, ...state.sourceQueue];
  const movedItem = path[visitIndexesByEntry(state, path).get(command.sourceEntryId) ?? -1];

  if (!movedItem || !isQueueItem(movedItem)) return state;

  const historyIds = new Set(state.previousSourceItems.map((item) => item.queueItemId));
  const movedFromHistory = historyIds.has(movedItem.queueItemId);

  const attached = path.filter(
    (item): item is QueueItem =>
      isQueueItem(item) &&
      item.anchor?.sourceEntryId === command.sourceEntryId &&
      historyIds.has(item.queueItemId) === movedFromHistory,
  );

  const movedIds = new Set([movedItem.queueItemId, ...attached.map((item) => item.queueItemId)]);

  const remaining = path.filter((item) => !isQueueItem(item) || !movedIds.has(item.queueItemId));
  const visitIndexes = visitIndexesByEntry(state, remaining);
  const targetIndex = visitIndexes.get(command.targetSourceEntryId) ?? -1;
  const target = remaining[targetIndex];

  const targetFromHistory =
    target && isQueueItem(target) ? historyIds.has(target.queueItemId) : false;

  const targetGroupIndexes = remaining.flatMap((item, index) =>
    isQueueItem(item) &&
    item.anchor?.sourceEntryId === command.targetSourceEntryId &&
    item.anchor.side === command.side &&
    historyIds.has(item.queueItemId) === targetFromHistory
      ? [index]
      : [],
  );

  // Without a queued target visit, insert before the next entry that has one.
  const targetPosition = command.orderedSourceEntryIds.indexOf(command.targetSourceEntryId);

  const fallbackIndex =
    targetPosition === -1
      ? undefined
      : command.orderedSourceEntryIds
          .slice(targetPosition + 1)
          .map((sourceEntryId) => visitIndexes.get(sourceEntryId))
          .find((index) => index !== undefined);

  const insertionIndex =
    targetIndex === -1
      ? (fallbackIndex ?? remaining.length)
      : command.side === "before"
        ? Math.min(targetIndex, ...targetGroupIndexes)
        : Math.max(targetIndex, ...targetGroupIndexes) + 1;

  remaining.splice(
    insertionIndex,
    0,
    ...attached.filter((item) => item.anchor?.side === "before"),
    movedItem,
    ...attached.filter((item) => item.anchor?.side === "after"),
  );

  const currentIndex = remaining.indexOf(current);

  return {
    ...state,
    previousSourceItems: remaining.slice(0, currentIndex).filter(isQueueItem),
    sourceQueue: remaining.slice(currentIndex + 1).filter(isQueueItem),
  };
}

/** Playback keeps the deleted playlist's saved source entries and its sourceIdentity. */
export function detachSource(
  state: QueueState,
  { playlistId }: CommandOf<"sourceDeleted">,
): QueueState {
  return state.source.kind === "playlist" && state.source.playlistId === playlistId
    ? { ...state, source: { kind: "detached", title: state.source.title } }
    : state;
}

export function appendNewLibraryTracks(
  state: QueueState,
  { entries }: CommandOf<"libraryRescanned">,
): QueueState {
  if (state.source.kind !== "all-tracks") return state;

  const known = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));
  const added = entries.filter((entry) => !known.has(entry.sourceEntryId));

  if (added.length === 0) return state;

  return {
    ...state,
    sourceEntries: [...state.sourceEntries, ...added],
    sourceQueue: [
      ...state.sourceQueue,
      ...createSourceItems(state, added, state.sourceIdentity, state.sessionId),
    ],
  };
}

function reorderSourceEntries(entries: readonly SourceEntry[], orderedIds: readonly number[]) {
  if (orderedIds.length !== entries.length || new Set(orderedIds).size !== entries.length)
    return null;

  const byId = new Map(entries.map((entry) => [entry.sourceEntryId, entry]));
  const reordered = orderedIds.flatMap((id) => byId.get(id) ?? []);

  return reordered.length === entries.length ? reordered : null;
}

/**
 * Selects one path index per source entry. Prefers the current item, then the first upcoming
 * visit. Without either, selects the last visit in Previous history.
 */
function visitIndexesByEntry(state: QueueState, path: readonly PathItem[]) {
  const upcomingIds = new Set(state.sourceQueue.map((item) => item.queueItemId));
  const currentItemId = state.current?.item.queueItemId;
  const indexes = new Map<number, number>();

  path.forEach((item, index) => {
    if (!isQueueItem(item)) return;
    const sourceEntryId = activeSourceEntryId(state, item);

    if (sourceEntryId === null) return;
    const selectedIndex = indexes.get(sourceEntryId);
    const selected = selectedIndex === undefined ? undefined : path[selectedIndex];

    if (selected && isQueueItem(selected)) {
      if (selected.queueItemId === currentItemId) return;

      if (item.queueItemId !== currentItemId && upcomingIds.has(selected.queueItemId)) return;
    }

    indexes.set(sourceEntryId, index);
  });

  return indexes;
}

function isQueueItem(item: PathItem): item is QueueItem {
  return item !== currentSlot;
}
