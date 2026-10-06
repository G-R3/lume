import type { QueueCommand, QueueContext } from "./commands";
import {
  activeSourceEntryId,
  addUnique,
  clearAnchorsTo,
  createSourceItems,
  historyWithCurrent,
  playAs,
} from "./items";
import type { QueueItem, QueueLane, QueueState, SourceEntry, SourceIdentity } from "./model";
import { selectSourceEntry, setShuffleEnabled } from "./shuffle";
import {
  addSourceEntry,
  appendNewLibraryTracks,
  detachSource,
  moveSourceEntry,
  removeSourceEntry,
} from "./source-edits";

/**
 * Applies a queue command and returns the updated queue.
 * The playback controller controls audio playback.
 */
export function transition(
  state: QueueState | null,
  command: QueueCommand,
  context: QueueContext,
): QueueState | null {
  if (command.type === "startSession") return startSession(state, command, context);

  if (!state) return null;

  switch (command.type) {
    case "setShuffleEnabled":
      return setShuffleEnabled(state, command.enabled, context.random);
    case "selectSourceEntry":
      return selectSourceEntry(
        state,
        command.source,
        command.sourceEntryId,
        context.availableTrackIds,
      );
    case "enqueueTrack":
      return enqueueTrack(state, command);
    case "jumpTo":
      return jumpTo(state, command.queueItemId, context.availableTrackIds);
    case "moveQueueItem":
      return moveQueueItem(state, command);
    case "removeQueueItem":
      return removeQueueItem(state, command.queueItemId);
    case "next":
      return next(state, context.availableTrackIds);
    case "previous":
      return previous(state, context.availableTrackIds);
    case "playbackStarted":
      return state.current && state.status !== "playing" ? { ...state, status: "playing" } : state;
    case "playbackPaused":
      return state.current && state.status !== "paused" ? { ...state, status: "paused" } : state;
    case "sourceEntryAdded":
      return addSourceEntry(state, command, context.random);
    case "sourceEntryRemoved":
      return removeSourceEntry(state, command);
    case "sourceEntryMoved":
      return moveSourceEntry(state, command);
    case "sourceDeleted":
      return detachSource(state, command);
    case "libraryRescanned":
      return appendNewLibraryTracks(state, command);
  }
}

/**
 * Starts a new source session and keeps the manual queue. A shuffled session queues every other
 * entry in a random order and has no Previous history. A sequential session continues in source
 * order, and Previous returns to the entries before the start.
 */
function startSession(
  previous: QueueState | null,
  command: Extract<QueueCommand, { type: "startSession" }>,
  { availableTrackIds, random }: QueueContext,
): QueueState | null {
  const { entries, start } = command;

  if (new Set(entries.map((entry) => entry.sourceEntryId)).size !== entries.length) return previous;

  const isAvailable = (entry: SourceEntry) => availableTrackIds.has(entry.trackId);

  // Check the start before shuffling, so a rejected start uses no random values.
  const requestedStart =
    start.kind === "entry"
      ? entries.find((entry) => entry.sourceEntryId === start.sourceEntryId && isAvailable(entry))
      : entries.find(isAvailable);

  if (!requestedStart) return previous;

  const order = command.shuffled ? random.shuffle(entries) : entries;

  // A random start is the first available entry in the shuffled order. requestedStart shows that
  // one exists.
  const startEntry =
    start.kind === "random" ? (order.find(isAvailable) ?? requestedStart) : requestedStart;

  const sourceIdentity: SourceIdentity =
    command.source.kind === "all-tracks"
      ? { kind: "all-tracks" }
      : { kind: "playlist", playlistId: command.source.playlistId };

  const items = createSourceItems(previous, entries, sourceIdentity, command.sessionId);
  const startIndex = entries.findIndex((entry) => entry.sourceEntryId === startEntry.sourceEntryId);
  const startItem = items[startIndex];

  return {
    source: command.source,
    sourceIdentity,
    sourceEntries: [...entries],
    sourcePosition: { kind: "entry", sourceEntryId: startEntry.sourceEntryId },
    shuffleEnabled: command.shuffled,
    sessionId: command.sessionId,
    current: playAs(startItem, "source"),
    manualQueue: previous?.manualQueue ?? [],
    sourceQueue: command.shuffled
      ? reorderItems(entries, items, order).filter((item) => item !== startItem)
      : items.slice(startIndex + 1),
    previousSourceItems: command.shuffled ? [] : items.slice(0, startIndex),
    suppressedSourceEntryIds: [],
    status: command.paused ? "paused" : "playing",
    lastSelectedItem: startItem,
  };
}

/** Reorders the items of a new session to match `order`. `items[i]` was created for `entries[i]`. */
function reorderItems(
  entries: readonly SourceEntry[],
  items: readonly QueueItem[],
  order: readonly SourceEntry[],
) {
  const itemsByEntry = new Map(entries.map((entry, index) => [entry.sourceEntryId, items[index]]));

  return order.flatMap((entry) => itemsByEntry.get(entry.sourceEntryId) ?? []);
}

function enqueueTrack(
  state: QueueState,
  command: Extract<QueueCommand, { type: "enqueueTrack" }>,
): QueueState {
  if (
    state.current?.item.queueItemId === command.queueItemId ||
    state.lastSelectedItem?.queueItemId === command.queueItemId ||
    state.manualQueue.some((item) => item.queueItemId === command.queueItemId) ||
    state.sourceQueue.some((item) => item.queueItemId === command.queueItemId) ||
    state.previousSourceItems.some((item) => item.queueItemId === command.queueItemId)
  )
    return state;

  const item: QueueItem = {
    queueItemId: command.queueItemId,
    trackId: command.trackId,
    origin: { kind: "manual" },
  };

  if (!state.current && state.status === "stopped") {
    return { ...state, current: playAs(item, "manual"), status: "playing", lastSelectedItem: item };
  }

  return { ...state, manualQueue: [...state.manualQueue, item] };
}

function next(state: QueueState, availableTrackIds: ReadonlySet<number>): QueueState {
  const previousSourceItems = historyWithCurrent(state);
  const manualIndex = state.manualQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (manualIndex !== -1) {
    const item = state.manualQueue[manualIndex];

    return {
      ...state,
      current: playAs(item, "manual"),
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSourceItems,
      status: "playing",
      lastSelectedItem: item,
    };
  }

  const sourceIndex = state.sourceQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (sourceIndex !== -1) {
    const item = state.sourceQueue[sourceIndex];

    return {
      ...state,
      sourcePosition: sourcePositionForItem(state, item),
      current: playAs(item, "source"),
      manualQueue: [],
      previousSourceItems: [...previousSourceItems, ...state.sourceQueue.slice(0, sourceIndex)],
      sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
      status: "playing",
      lastSelectedItem: item,
    };
  }

  return {
    ...state,
    current: null,
    manualQueue: [],
    previousSourceItems: [...previousSourceItems, ...state.sourceQueue],
    sourceQueue: [],
    status: "stopped",
  };
}

function previous(state: QueueState, availableTrackIds: ReadonlySet<number>): QueueState {
  const previousIndex = state.previousSourceItems.findLastIndex((item) =>
    availableTrackIds.has(item.trackId),
  );

  if (previousIndex === -1) return state;

  const item = state.previousSourceItems[previousIndex];

  return {
    ...state,
    sourcePosition: sourcePositionForItem(state, item),
    current: playAs(item, "source"),
    previousSourceItems: state.previousSourceItems.slice(0, previousIndex),
    sourceQueue: [
      ...state.previousSourceItems.slice(previousIndex + 1),
      ...(state.current?.participatesInSourceNavigation ? [state.current.item] : []),
      ...state.sourceQueue,
    ],
    status: "playing",
    lastSelectedItem: item,
  };
}

function jumpTo(
  state: QueueState,
  queueItemId: string,
  availableTrackIds: ReadonlySet<number>,
): QueueState {
  const manualIndex = state.manualQueue.findIndex((item) => item.queueItemId === queueItemId);

  if (manualIndex !== -1) {
    const item = state.manualQueue[manualIndex];

    if (!availableTrackIds.has(item.trackId)) return state;

    return {
      ...state,
      current: playAs(item, "manual"),
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSourceItems: historyWithCurrent(state),
      status: "playing",
      lastSelectedItem: item,
    };
  }

  const sourceIndex = state.sourceQueue.findIndex((item) => item.queueItemId === queueItemId);

  if (sourceIndex === -1) return state;
  const item = state.sourceQueue[sourceIndex];

  if (!availableTrackIds.has(item.trackId)) return state;

  return {
    ...state,
    sourcePosition: sourcePositionForItem(state, item),
    current: playAs(item, "source"),
    previousSourceItems: [...historyWithCurrent(state), ...state.sourceQueue.slice(0, sourceIndex)],
    sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
    status: "playing",
    lastSelectedItem: item,
  };
}

/**
 * Removes a queued item. Removing a source occurrence also removes its other visits and keeps
 * it out of this session.
 */
function removeQueueItem(state: QueueState, queueItemId: string): QueueState {
  if (state.manualQueue.some((item) => item.queueItemId === queueItemId)) {
    return {
      ...state,
      manualQueue: state.manualQueue.filter((item) => item.queueItemId !== queueItemId),
    };
  }

  const item = state.sourceQueue.find((candidate) => candidate.queueItemId === queueItemId);

  if (!item) return state;

  const removedEntryId = activeSourceEntryId(state, item);

  if (removedEntryId === null)
    return {
      ...state,
      sourceQueue: state.sourceQueue.filter((candidate) => candidate.queueItemId !== queueItemId),
    };

  const isRemovedEntry = (candidate: QueueItem) =>
    activeSourceEntryId(state, candidate) === removedEntryId;

  return {
    ...state,
    current:
      state.current && isRemovedEntry(state.current.item)
        ? { ...state.current, participatesInSourceNavigation: false }
        : state.current,
    previousSourceItems: state.previousSourceItems.filter((previous) => !isRemovedEntry(previous)),
    sourceQueue: clearAnchorsTo(
      state,
      state.sourceQueue.filter((candidate) => !isRemovedEntry(candidate)),
      item,
    ),
    suppressedSourceEntryIds: addUnique(state.suppressedSourceEntryIds, removedEntryId),
  };
}

function moveQueueItem(
  state: QueueState,
  command: Extract<QueueCommand, { type: "moveQueueItem" }>,
): QueueState {
  const from: QueueLane = state.manualQueue.some((item) => item.queueItemId === command.queueItemId)
    ? "manual"
    : "source";

  const fromQueue = from === "manual" ? state.manualQueue : state.sourceQueue;
  const item = fromQueue.find((candidate) => candidate.queueItemId === command.queueItemId);

  if (!item || command.beforeQueueItemId === item.queueItemId) return state;

  const manualQueue =
    from === "manual"
      ? state.manualQueue.filter((candidate) => candidate.queueItemId !== item.queueItemId)
      : [...state.manualQueue];

  const sourceQueue =
    from === "source"
      ? clearAnchorsTo(
          state,
          state.sourceQueue.filter((candidate) => candidate.queueItemId !== item.queueItemId),
          item,
        )
      : [...state.sourceQueue];

  const destination = command.to === "manual" ? manualQueue : sourceQueue;

  const insertionIndex = command.beforeQueueItemId
    ? destination.findIndex((candidate) => candidate.queueItemId === command.beforeQueueItemId)
    : destination.length;

  if (insertionIndex === -1) return state;

  const sourceEntryId = activeSourceEntryId(state, item);

  // A queue-only item in the source lane stays next to its neighboring source entry.
  destination.splice(insertionIndex, 0, {
    ...item,
    anchor:
      command.to === "source" && sourceEntryId === null
        ? findSourceAnchor(state, sourceQueue, insertionIndex)
        : undefined,
  });

  const suppressedSourceEntryIds =
    sourceEntryId === null
      ? state.suppressedSourceEntryIds
      : command.to === "manual"
        ? addUnique(state.suppressedSourceEntryIds, sourceEntryId)
        : state.suppressedSourceEntryIds.filter((id) => id !== sourceEntryId);

  return { ...state, manualQueue, sourceQueue, suppressedSourceEntryIds };
}

function sourcePositionForItem(state: QueueState, item: QueueItem) {
  const sourceEntryId = activeSourceEntryId(state, item);

  return sourceEntryId === null ? state.sourcePosition : { kind: "entry" as const, sourceEntryId };
}

function findSourceAnchor(
  state: QueueState,
  sourceQueue: readonly QueueItem[],
  insertionIndex: number,
) {
  for (let index = insertionIndex; index < sourceQueue.length; index++) {
    const sourceEntryId = activeSourceEntryId(state, sourceQueue[index]);

    if (sourceEntryId !== null) return { sourceEntryId, side: "before" as const };
  }

  for (let index = insertionIndex - 1; index >= 0; index--) {
    const sourceEntryId = activeSourceEntryId(state, sourceQueue[index]);

    if (sourceEntryId !== null) return { sourceEntryId, side: "after" as const };
  }

  return undefined;
}
