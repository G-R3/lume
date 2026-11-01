import type { QueueCommand, QueueRandom } from "./commands";
import { activeSourceEntryId, createSourceItems, isActivePlaylist } from "./items";
import type { QueueItem, QueueState, SourceEntry } from "./model";

type CommandOf<Type extends QueueCommand["type"]> = Extract<QueueCommand, { type: Type }>;

function followsSource(state: QueueState) {
  return state.filter === null;
}

export function appendSourceEntries(
  state: QueueState,
  { playlistId, entries }: CommandOf<"sourceEntriesAdded">,
  random: QueueRandom,
): QueueState {
  if (!followsSource(state) || !isActivePlaylist(state, playlistId)) return state;

  const known = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  const added = entries.filter((entry) => {
    if (known.has(entry.sourceEntryId)) return false;
    known.add(entry.sourceEntryId);

    return true;
  });

  if (added.length === 0) return state;

  const sourceQueue = [...state.sourceQueue];

  for (const item of createSourceItems(state, added, state.sourceIdentity, state.sessionId)) {
    sourceQueue.splice(
      state.shuffleEnabled ? random.index(sourceQueue.length + 1) : sourceQueue.length,
      0,
      item,
    );
  }

  return {
    ...state,
    sourceEntries: [...state.sourceEntries, ...added],
    sourceQueue,
  };
}

export function removeSourceEntries(
  state: QueueState,
  { playlistId, sourceEntryIds }: CommandOf<"sourceEntriesRemoved">,
): QueueState {
  if (!isActivePlaylist(state, playlistId)) return state;

  const removed = new Set(sourceEntryIds);

  const isRemovedEntry = (item: QueueItem) => {
    const sourceEntryId = activeSourceEntryId(state, item);

    return sourceEntryId !== null && removed.has(sourceEntryId);
  };

  const clearRemovedAnchor = (item: QueueItem) =>
    item.anchor && removed.has(item.anchor.sourceEntryId) ? { ...item, anchor: undefined } : item;

  const removedBefore = (index: number) =>
    state.sourceEntries.slice(0, index).filter((entry) => removed.has(entry.sourceEntryId)).length;

  const position = state.sourcePosition;

  const removedPositionIndex =
    position?.kind === "entry" && removed.has(position.sourceEntryId)
      ? state.sourceEntries.findIndex((entry) => entry.sourceEntryId === position.sourceEntryId)
      : -1;

  const currentRemoved =
    state.current?.participatesInSourceNavigation && isRemovedEntry(state.current.item);

  return {
    ...state,
    sourceEntries: state.sourceEntries.filter((entry) => !removed.has(entry.sourceEntryId)),
    sourcePosition:
      removedPositionIndex !== -1
        ? { kind: "boundary", index: removedPositionIndex - removedBefore(removedPositionIndex) }
        : position?.kind === "boundary"
          ? { kind: "boundary", index: position.index - removedBefore(position.index) }
          : position,
    current: state.current && {
      ...state.current,
      item: clearRemovedAnchor(state.current.item),
      participatesInSourceNavigation: currentRemoved
        ? false
        : state.current.participatesInSourceNavigation,
    },
    lastSelectedItem: state.lastSelectedItem && clearRemovedAnchor(state.lastSelectedItem),
    previousSourceItems: state.previousSourceItems
      .filter((item) => !isRemovedEntry(item))
      .map(clearRemovedAnchor),
    sourceQueue: state.sourceQueue.filter((item) => !isRemovedEntry(item)).map(clearRemovedAnchor),
    suppressedSourceEntryIds: state.suppressedSourceEntryIds.filter((id) => !removed.has(id)),
  };
}

const currentSlot = { kind: "current-slot" } as const;

type PathItem = QueueItem | typeof currentSlot;

export function moveSourceEntry(
  state: QueueState,
  command: CommandOf<"sourceEntryMoved">,
): QueueState {
  if (
    !followsSource(state) ||
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
  if (!followsSource(state) || state.source.kind !== "all-tracks") return state;

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
