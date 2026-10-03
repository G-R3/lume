import type {
  QueueItem,
  QueueLane,
  QueueState,
  SourceEntry,
  SourceIdentity,
  SourcePosition,
  SourceRef,
} from "./queue-model";

export type {
  QueueItem,
  QueueLane,
  QueueState,
  SourceEntry,
  SourceIdentity,
  SourcePosition,
  SourceRef,
} from "./queue-model";

export { parseQueueSession, serializeQueueSession } from "./queue-session";

export type QueueCommand =
  | {
      type: "startFromSource";
      source: SourceRef;
      entries: readonly SourceEntry[];
      startEntryId: number;
      sessionId: string;
      startPaused?: boolean;
    }
  | { type: "selectSourceEntry"; source: SourceIdentity; sourceEntryId: number }
  | { type: "enqueueTrack"; trackId: number; queueItemId: string }
  | { type: "jumpTo"; queueItemId: string }
  | {
      type: "moveQueueItem";
      queueItemId: string;
      to: QueueLane;
      beforeQueueItemId?: string;
    }
  | { type: "removeQueueItem"; queueItemId: string }
  | { type: "next"; reason: "ended" | "skip" | "error" }
  | { type: "previous" }
  | { type: "playbackStarted" }
  | { type: "playbackPaused" }
  | {
      type: "sourceEntryAdded";
      playlistId: number;
      entry: SourceEntry;
      canonicalIndex?: number;
      insertionIndex?: number;
    }
  | { type: "sourceEntryRemoved"; playlistId: number; sourceEntryId: number }
  | {
      type: "sourceEntryMoved";
      playlistId: number;
      sourceEntryId: number;
      targetSourceEntryId: number;
      side: "before" | "after";
      orderedSourceEntryIds: readonly number[];
    }
  | { type: "sourceDeleted"; playlistId: number }
  | { type: "libraryRescanned"; entries: readonly SourceEntry[] };

export function selectQueueView(state: QueueState | null) {
  if (!state) return null;

  return {
    source: state.source,
    current: state.current,
    manualQueue: state.manualQueue,
    sourceQueue: state.sourceQueue,
    status: state.status,
  };
}

/** Return the occurrence ID only when current belongs to the active source session. */
export function selectActiveSourceEntryId(state: QueueState | null) {
  if (!state || state.source.kind === "detached" || !state.current) return null;
  const current = state.current;

  return current.lane === "source" &&
    current.participatesInSourceNavigation &&
    isSourceItem(state, current.item) &&
    current.item.origin.kind === "source"
    ? current.item.origin.sourceEntryId
    : null;
}

export function selectCanGoNext(state: QueueState | null, availableTrackIds: ReadonlySet<number>) {
  if (!state) return false;

  return (
    state.manualQueue.length > 0 ||
    state.sourceQueue.length > 0 ||
    (state.current !== null && !availableTrackIds.has(state.current.item.trackId))
  );
}

/**
 * applies a queue command and returns the updated queue.
 * The playback controller controls audio playback.
 */
export function transition(
  state: QueueState | null,
  command: QueueCommand,
  availableTrackIds: ReadonlySet<number>,
): QueueState | null {
  if (command.type === "startFromSource") return startFromSource(state, command);

  if (!state) return null;

  switch (command.type) {
    case "selectSourceEntry":
      return selectSourceEntry(state, command.source, command.sourceEntryId, availableTrackIds);
    case "enqueueTrack":
      return enqueueTrack(state, command);
    case "jumpTo":
      return jumpTo(state, command.queueItemId, availableTrackIds);
    case "moveQueueItem":
      return moveQueueItem(state, command);
    case "removeQueueItem":
      return removeQueueItem(state, command.queueItemId);
    case "next":
      return next(state, availableTrackIds);
    case "previous":
      return previous(state, availableTrackIds);
    case "playbackStarted":
      return state.current && state.status !== "playing" ? { ...state, status: "playing" } : state;
    case "playbackPaused":
      return state.current && state.status !== "paused" ? { ...state, status: "paused" } : state;
    case "sourceEntryAdded":
      return isActivePlaylist(state, command.playlistId)
        ? addSourceEntry(state, command.entry, command.canonicalIndex, command.insertionIndex)
        : state;
    case "sourceEntryRemoved":
      return isActivePlaylist(state, command.playlistId)
        ? removeSourceEntry(state, command.sourceEntryId)
        : state;
    case "sourceEntryMoved":
      return isActivePlaylist(state, command.playlistId) ? moveSourceEntry(state, command) : state;
    case "sourceDeleted":
      return state.source.kind === "playlist" && state.source.playlistId === command.playlistId
        ? { ...state, source: { kind: "detached", title: state.source.title } }
        : state;
    case "libraryRescanned":
      return appendNewLibraryTracks(state, command.entries);
  }
}

/** Prepare a committed addition before the controller supplies its random position. */
export function prepareSourceEntryAddition(
  state: QueueState | null,
  command: Extract<QueueCommand, { type: "sourceEntryAdded" }>,
) {
  if (!state || !isActivePlaylist(state, command.playlistId)) return null;

  if (state.sourceEntries.some((entry) => entry.sourceEntryId === command.entry.sourceEntryId))
    return null;

  return {
    command,
    insertionPositions: state.shuffleEnabled ? state.sourceQueue.length + 1 : null,
  };
}

/** This function selects eligible source entries. The controller supplies their order. */
export function prepareShuffle(state: QueueState, enabled: boolean) {
  if (state.shuffleEnabled === enabled) return null;

  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  const currentEntryId =
    state.current &&
    isSourceItem(state, state.current.item, sourceEntryIds) &&
    state.current.participatesInSourceNavigation &&
    state.current.item.origin.kind === "source"
      ? state.current.item.origin.sourceEntryId
      : null;

  const suppressedEntryIds = new Set(state.suppressedSourceEntryIds);

  const manualEntryIds = new Set(
    state.manualQueue.flatMap((item) =>
      isSourceItem(state, item, sourceEntryIds) && item.origin.kind === "source"
        ? [item.origin.sourceEntryId]
        : [],
    ),
  );

  const position = state.sourcePosition;

  const startIndex =
    position?.kind === "entry"
      ? state.sourceEntries.findIndex((entry) => entry.sourceEntryId === position.sourceEntryId) + 1
      : position?.kind === "boundary"
        ? position.index
        : 0;

  return {
    state,
    enabled,
    entries: state.sourceEntries.filter(
      (entry, index) =>
        (enabled || index >= startIndex) &&
        entry.sourceEntryId !== currentEntryId &&
        !suppressedEntryIds.has(entry.sourceEntryId) &&
        !manualEntryIds.has(entry.sourceEntryId),
    ),
    queueOnlyItems: state.sourceQueue.filter((item) => !isSourceItem(state, item, sourceEntryIds)),
  };
}

/**
 * If the setting changes, use the state object passed to prepareShuffle.
 * If the setting has not changed, this function returns the original state object.
 */
export function setShuffleEnabled(
  state: QueueState,
  enabled: boolean,
  prepared: ReturnType<typeof prepareShuffle> = null,
  orderedSourceEntryIds: readonly number[] = [],
): QueueState {
  if (state.shuffleEnabled === enabled) return state;

  if (!prepared || prepared.state !== state || prepared.enabled !== enabled) return state;

  const entries = orderSourceEntries(
    prepared.entries,
    enabled ? orderedSourceEntryIds : prepared.entries.map((entry) => entry.sourceEntryId),
  );

  if (!entries) return state;

  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  const existing = new Map(
    state.sourceQueue.flatMap((item) =>
      isSourceItem(state, item, sourceEntryIds) && item.origin.kind === "source"
        ? [[item.origin.sourceEntryId, item] as const]
        : [],
    ),
  );

  const created = createSourceItems(
    state,
    entries.filter((entry) => !existing.has(entry.sourceEntryId)),
    state.sourceIdentity,
    state.sessionId,
  );

  const createdByEntry = new Map(
    created.flatMap((item) =>
      item.origin.kind === "source" ? [[item.origin.sourceEntryId, item] as const] : [],
    ),
  );

  const sourceItems = entries.flatMap((entry) => {
    const item = existing.get(entry.sourceEntryId) ?? createdByEntry.get(entry.sourceEntryId);

    return item ? [item] : [];
  });

  // Keep queue-only items in their chosen order around each source entry.
  const before = new Map<number, QueueItem[]>();
  const after = new Map<number, QueueItem[]>();
  prepared.queueOnlyItems.forEach((item) => {
    if (!item.anchor) return;

    const groups = item.anchor.side === "before" ? before : after;
    const group = groups.get(item.anchor.sourceEntryId) ?? [];

    group.push(item);
    groups.set(item.anchor.sourceEntryId, group);
  });

  const sourceQueue = sourceItems.flatMap((item) =>
    item.origin.kind === "source"
      ? [
          ...(before.get(item.origin.sourceEntryId) ?? []),
          item,
          ...(after.get(item.origin.sourceEntryId) ?? []),
        ]
      : [item],
  );

  const includedEntries = new Set(entries.map((entry) => entry.sourceEntryId));

  return {
    ...state,
    shuffleEnabled: enabled,
    sourceQueue: [
      ...sourceQueue,
      ...prepared.queueOnlyItems.filter(
        (item) => !item.anchor || !includedEntries.has(item.anchor.sourceEntryId),
      ),
    ],
  };
}

export function prepareShufflePlay(
  state: QueueState | null,
  source: Exclude<SourceRef, { kind: "detached" }>,
  entries: readonly SourceEntry[],
  sessionId: string,
  availableTrackIds: ReadonlySet<number>,
  startEntryId?: number,
) {
  if (new Set(entries.map((entry) => entry.sourceEntryId)).size !== entries.length) return null;

  const availableStartEntryIds = entries.flatMap((entry) =>
    availableTrackIds.has(entry.trackId) ? [entry.sourceEntryId] : [],
  );

  if (
    availableStartEntryIds.length === 0 ||
    (startEntryId !== undefined && !availableStartEntryIds.includes(startEntryId))
  )
    return null;

  return { state, source, entries: [...entries], sessionId, availableStartEntryIds, startEntryId };
}

export function shufflePlay(
  state: QueueState | null,
  prepared: ReturnType<typeof prepareShufflePlay>,
  orderedSourceEntryIds: readonly number[],
  startPaused = false,
): QueueState | null {
  if (!prepared || prepared.state !== state) return state;
  const entries = orderSourceEntries(prepared.entries, orderedSourceEntryIds);

  if (!entries) return state;
  const availableStartEntryIds = new Set(prepared.availableStartEntryIds);

  const start = entries.find((entry) =>
    prepared.startEntryId === undefined
      ? availableStartEntryIds.has(entry.sourceEntryId)
      : entry.sourceEntryId === prepared.startEntryId,
  );

  if (!start) return state;

  const started = startFromSource(state, {
    type: "startFromSource",
    source: prepared.source,
    entries: prepared.entries,
    sessionId: prepared.sessionId,
    startEntryId: start.sourceEntryId,
    startPaused,
  });

  if (!started) return state;

  const byId = new Map(
    [
      ...started.previousSourceItems,
      ...started.sourceQueue,
      ...(started.current ? [started.current.item] : []),
    ].flatMap((item) =>
      item.origin.kind === "source" ? [[item.origin.sourceEntryId, item] as const] : [],
    ),
  );

  return {
    ...started,
    shuffleEnabled: true,
    previousSourceItems: [],
    sourceQueue: entries.flatMap((entry) => {
      const item = byId.get(entry.sourceEntryId);

      return item && entry.sourceEntryId !== start.sourceEntryId ? [item] : [];
    }),
  };
}

/** selects a source entry during shuffle without removing other upcoming queue items. */
function selectSourceEntry(
  state: QueueState,
  source: SourceIdentity,
  sourceEntryId: number,
  availableTrackIds: ReadonlySet<number>,
): QueueState {
  if (!state.shuffleEnabled || !sameSource(state.sourceIdentity, source)) return state;
  const entry = state.sourceEntries.find((candidate) => candidate.sourceEntryId === sourceEntryId);

  if (!entry || !availableTrackIds.has(entry.trackId)) return state;

  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  if (
    state.current &&
    isSourceItem(state, state.current.item, sourceEntryIds) &&
    state.current.item.origin.kind === "source" &&
    state.current.item.origin.sourceEntryId === sourceEntryId &&
    state.current.participatesInSourceNavigation
  )
    return {
      ...state,
      status: "playing",
    };

  const upcoming = state.sourceQueue.find(
    (item) =>
      isSourceItem(state, item, sourceEntryIds) &&
      item.origin.kind === "source" &&
      item.origin.sourceEntryId === sourceEntryId,
  );

  const item =
    upcoming ?? createSourceItems(state, [entry], state.sourceIdentity, state.sessionId)[0];

  return {
    ...state,
    sourcePosition: { kind: "entry", sourceEntryId },
    current: {
      item,
      lane: "source",
      participatesInSourceNavigation: true,
    },
    sourceQueue: state.sourceQueue.filter((queued) => queued.queueItemId !== item.queueItemId),
    previousSourceItems: appendCurrentSource(state),
    lastSelectedItem: item,
    status: "playing",
  };
}

function orderSourceEntries(entries: readonly SourceEntry[], orderedIds: readonly number[]) {
  if (orderedIds.length !== entries.length || new Set(orderedIds).size !== entries.length)
    return null;
  const byId = new Map(entries.map((entry) => [entry.sourceEntryId, entry]));

  if (orderedIds.some((id) => !byId.has(id))) return null;

  return orderedIds.flatMap((id) => {
    const entry = byId.get(id);

    return entry ? [entry] : [];
  });
}

export function sameSource(left: SourceIdentity, right: SourceIdentity) {
  return (
    left.kind === right.kind &&
    (left.kind === "all-tracks" ||
      (right.kind === "playlist" && left.playlistId === right.playlistId))
  );
}

function isSourceItem(state: QueueState, item: QueueItem, sourceEntryIds?: ReadonlySet<number>) {
  return (
    item.origin.kind === "source" &&
    item.origin.sessionId === state.sessionId &&
    sameSource(state.sourceIdentity, item.origin.source) &&
    (sourceEntryIds
      ? sourceEntryIds.has(item.origin.sourceEntryId)
      : state.sourceEntries.some(
          (entry) =>
            item.origin.kind === "source" && entry.sourceEntryId === item.origin.sourceEntryId,
        ))
  );
}

function sourcePositionForItem(state: QueueState, item: QueueItem): SourcePosition {
  if (!isSourceItem(state, item) || item.origin.kind !== "source") return state.sourcePosition;

  return { kind: "entry", sourceEntryId: item.origin.sourceEntryId };
}

/** creates source queue items with IDs that differ from all stored queue item IDs. */
function createSourceItems(
  state: QueueState | null,
  entries: readonly SourceEntry[],
  source: SourceIdentity,
  sessionId: string,
): QueueItem[] {
  const retainedIds = new Set(
    state
      ? [
          ...state.manualQueue,
          ...state.sourceQueue,
          ...state.previousSourceItems,
          ...(state.current ? [state.current.item] : []),
          ...(state.lastSelectedItem ? [state.lastSelectedItem] : []),
        ].map((item) => item.queueItemId)
      : [],
  );

  return entries.map((entry) => {
    const base = sessionId + ":source:" + entry.sourceEntryId;
    let visit = 0;

    while (retainedIds.has(visit === 0 ? base : base + ":visit:" + visit)) visit++;

    const queueItemId = visit === 0 ? base : base + ":visit:" + visit;
    retainedIds.add(queueItemId);

    return {
      queueItemId,
      trackId: entry.trackId,
      origin: { kind: "source", sourceEntryId: entry.sourceEntryId, source, sessionId },
    };
  });
}

function startFromSource(
  previous: QueueState | null,
  command: Extract<QueueCommand, { type: "startFromSource" }>,
): QueueState | null {
  const selectedIndex = command.entries.findIndex(
    (item) => item.sourceEntryId === command.startEntryId,
  );

  if (selectedIndex === -1) return previous;

  if (command.source.kind === "detached") return previous;

  const sourceIdentity: SourceIdentity =
    command.source.kind === "all-tracks"
      ? { kind: "all-tracks" }
      : { kind: "playlist", playlistId: command.source.playlistId };

  const items = createSourceItems(previous, command.entries, sourceIdentity, command.sessionId);

  return {
    source: command.source,
    sourceIdentity,
    sourceEntries: [...command.entries],
    sourcePosition: { kind: "entry", sourceEntryId: command.startEntryId },
    shuffleEnabled: false,
    sessionId: command.sessionId,
    current: {
      item: items[selectedIndex],
      lane: "source",
      participatesInSourceNavigation: true,
    },
    manualQueue: previous?.manualQueue ?? [],
    sourceQueue: items.slice(selectedIndex + 1),
    previousSourceItems: items.slice(0, selectedIndex),
    suppressedSourceEntryIds: [],
    status: command.startPaused ? "paused" : "playing",
    lastSelectedItem: items[selectedIndex],
  };
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
    return {
      ...state,
      current: {
        item,
        lane: "manual",
        participatesInSourceNavigation: false,
      },
      status: "playing",
      lastSelectedItem: item,
    };
  }

  return { ...state, manualQueue: [...state.manualQueue, item] };
}

function next(state: QueueState, availableTrackIds: ReadonlySet<number>): QueueState {
  const previousSourceItems = appendCurrentSource(state);
  const manualIndex = state.manualQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (manualIndex !== -1) {
    const item = state.manualQueue[manualIndex];

    return {
      ...state,
      current: {
        item,
        lane: "manual",
        participatesInSourceNavigation: false,
      },
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
      current: {
        item,
        lane: "source",
        participatesInSourceNavigation: true,
      },
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
    current: {
      item,
      lane: "source",
      participatesInSourceNavigation: true,
    },
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
      current: {
        item,
        lane: "manual",
        participatesInSourceNavigation: false,
      },
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSourceItems: appendCurrentSource(state),
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
    current: {
      item,
      lane: "source",
      participatesInSourceNavigation: true,
    },
    previousSourceItems: [
      ...appendCurrentSource(state),
      ...state.sourceQueue.slice(0, sourceIndex),
    ],
    sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
    status: "playing",
    lastSelectedItem: item,
  };
}

function removeQueueItem(state: QueueState, queueItemId: string): QueueState {
  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  if (state.manualQueue.some((item) => item.queueItemId === queueItemId)) {
    return {
      ...state,
      manualQueue: state.manualQueue.filter((item) => item.queueItemId !== queueItemId),
    };
  }

  const item = state.sourceQueue.find((candidate) => candidate.queueItemId === queueItemId);

  if (!item) return state;

  const removedSourceEntryId =
    isSourceItem(state, item, sourceEntryIds) && item.origin.kind === "source"
      ? item.origin.sourceEntryId
      : null;

  const matchesOccurrence = (candidate: QueueItem) =>
    removedSourceEntryId !== null &&
    isSourceItem(state, candidate, sourceEntryIds) &&
    candidate.origin.kind === "source" &&
    candidate.origin.sourceEntryId === removedSourceEntryId;

  return {
    ...state,
    current:
      state.current && matchesOccurrence(state.current.item)
        ? { ...state.current, participatesInSourceNavigation: false }
        : state.current,
    previousSourceItems:
      removedSourceEntryId !== null
        ? state.previousSourceItems.filter((previous) => !matchesOccurrence(previous))
        : state.previousSourceItems,
    sourceQueue: clearAnchor(
      state,
      state.sourceQueue.filter(
        (candidate) => candidate.queueItemId !== queueItemId && !matchesOccurrence(candidate),
      ),
      item,
    ),
    suppressedSourceEntryIds:
      removedSourceEntryId !== null
        ? addUnique(state.suppressedSourceEntryIds, removedSourceEntryId)
        : state.suppressedSourceEntryIds,
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
      ? clearAnchor(
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

  const movedItem =
    command.to === "source" && !isSourceItem(state, item)
      ? { ...item, anchor: findSourceAnchor(state, sourceQueue, insertionIndex) }
      : { ...item, anchor: undefined };

  destination.splice(insertionIndex, 0, movedItem);

  const sourceEntryId =
    isSourceItem(state, item) && item.origin.kind === "source" ? item.origin.sourceEntryId : null;

  const suppressedSourceEntryIds =
    sourceEntryId === null
      ? state.suppressedSourceEntryIds
      : command.to === "manual"
        ? addUnique(state.suppressedSourceEntryIds, sourceEntryId)
        : state.suppressedSourceEntryIds.filter((id) => id !== sourceEntryId);

  return { ...state, manualQueue, sourceQueue, suppressedSourceEntryIds };
}

function addSourceEntry(
  state: QueueState,
  entry: SourceEntry,
  canonicalIndex = state.sourceEntries.length,
  insertionIndex?: number,
): QueueState {
  if (state.sourceEntries.some((item) => item.sourceEntryId === entry.sourceEntryId)) return state;

  if (
    !Number.isInteger(canonicalIndex) ||
    canonicalIndex < 0 ||
    canonicalIndex > state.sourceEntries.length
  )
    return state;

  // The controller supplies a random queue position for new playlist entries during shuffle.
  if (
    (state.shuffleEnabled && insertionIndex === undefined) ||
    (insertionIndex !== undefined &&
      (!Number.isInteger(insertionIndex) ||
        insertionIndex < 0 ||
        insertionIndex > state.sourceQueue.length))
  )
    return state;
  const sourceEntries = [...state.sourceEntries];
  sourceEntries.splice(canonicalIndex, 0, entry);
  const sourceQueue = [...state.sourceQueue];
  sourceQueue.splice(
    insertionIndex ?? sourceQueue.length,
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

function removeSourceEntry(state: QueueState, sourceEntryId: number): QueueState {
  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  const matches = (item: QueueItem) =>
    isSourceItem(state, item, sourceEntryIds) &&
    item.origin.kind === "source" &&
    item.origin.sourceEntryId === sourceEntryId;

  const removedIndex = state.sourceEntries.findIndex(
    (entry) => entry.sourceEntryId === sourceEntryId,
  );

  const currentRemoved =
    state.current?.participatesInSourceNavigation && matches(state.current.item);

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
      .filter((item) => !matches(item))
      .map((item) => clearItemAnchor(item, sourceEntryId)),
    sourceQueue: state.sourceQueue
      .filter((item) => !matches(item))
      .map((item) => clearItemAnchor(item, sourceEntryId)),
    suppressedSourceEntryIds: state.suppressedSourceEntryIds.filter((id) => id !== sourceEntryId),
  };
}

function moveSourceEntry(
  state: QueueState,
  command: Extract<QueueCommand, { type: "sourceEntryMoved" }>,
): QueueState {
  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  if (command.sourceEntryId === command.targetSourceEntryId) return state;

  const fromIndex = state.sourceEntries.findIndex(
    (entry) => entry.sourceEntryId === command.sourceEntryId,
  );

  const toIndex = command.orderedSourceEntryIds.indexOf(command.sourceEntryId);

  if (fromIndex === -1 || toIndex === -1) return state;
  const sourceEntries = orderSourceEntries(state.sourceEntries, command.orderedSourceEntryIds);

  if (!sourceEntries) return state;

  const afterRemoval =
    state.sourcePosition?.kind === "boundary"
      ? state.sourcePosition.index - Number(fromIndex < state.sourcePosition.index)
      : null;

  state = {
    ...state,
    sourceEntries,
    sourcePosition:
      afterRemoval === null
        ? state.sourcePosition
        : { kind: "boundary", index: afterRemoval + Number(toIndex < afterRemoval) },
  };

  if (state.shuffleEnabled) return state;

  const boundary = { kind: "boundary" as const };

  const marker =
    state.current?.participatesInSourceNavigation && state.current.lane === "source"
      ? state.current.item
      : boundary;

  const path: (QueueItem | typeof boundary)[] = [
    ...state.previousSourceItems,
    marker,
    ...state.sourceQueue,
  ];

  const movedItem =
    path[sourceVisitIndexes(state, path, sourceEntryIds).get(command.sourceEntryId) ?? -1];

  if (!movedItem || !isQueueItem(movedItem)) return state;

  const historicalIds = new Set(state.previousSourceItems.map((item) => item.queueItemId));
  const movedFromHistory = historicalIds.has(movedItem.queueItemId);

  const attached = path.filter(
    (item): item is QueueItem =>
      isQueueItem(item) &&
      item.anchor?.sourceEntryId === command.sourceEntryId &&
      historicalIds.has(item.queueItemId) === movedFromHistory,
  );

  const movedIds = new Set([movedItem.queueItemId, ...attached.map((item) => item.queueItemId)]);

  const remaining = path.filter((item) => !isQueueItem(item) || !movedIds.has(item.queueItemId));
  const sourceIndexes = sourceVisitIndexes(state, remaining, sourceEntryIds);
  const targetIndex = sourceIndexes.get(command.targetSourceEntryId) ?? -1;
  const target = remaining[targetIndex];

  const targetFromHistory =
    target && isQueueItem(target) ? historicalIds.has(target.queueItemId) : false;

  const targetGroupIndexes = remaining.flatMap((item, index) =>
    isQueueItem(item) &&
    item.anchor?.sourceEntryId === command.targetSourceEntryId &&
    item.anchor.side === command.side &&
    historicalIds.has(item.queueItemId) === targetFromHistory
      ? [index]
      : [],
  );

  const targetPosition = command.orderedSourceEntryIds.indexOf(command.targetSourceEntryId);

  const fallbackIndex =
    targetPosition === -1
      ? undefined
      : command.orderedSourceEntryIds
          .slice(targetPosition + 1)
          .map((sourceEntryId) => sourceIndexes.get(sourceEntryId))
          .find((index) => index !== undefined);

  const insertionIndex =
    targetIndex === -1
      ? (fallbackIndex ?? remaining.length)
      : command.side === "before"
        ? Math.min(targetIndex, ...targetGroupIndexes)
        : Math.max(targetIndex, ...targetGroupIndexes) + 1;

  const group = [
    ...attached.filter((item) => item.anchor?.side === "before"),
    movedItem,
    ...attached.filter((item) => item.anchor?.side === "after"),
  ];

  remaining.splice(insertionIndex, 0, ...group);

  const currentItemId = isQueueItem(marker) ? marker.queueItemId : null;

  const currentIndex = remaining.findIndex((item) =>
    currentItemId === null
      ? item === boundary
      : isQueueItem(item) && item.queueItemId === currentItemId,
  );

  return {
    ...state,
    previousSourceItems: remaining.slice(0, currentIndex).filter(isQueueItem),
    sourceQueue: remaining.slice(currentIndex + 1).filter(isQueueItem),
  };
}

/**
 * This function selects one queue item per source entry.
 * It prefers the current item, then the first upcoming item.
 * If neither exists, it selects the last item from previousSourceItems.
 */
function sourceVisitIndexes(
  state: QueueState,
  items: readonly (QueueItem | { kind: "boundary" })[],
  sourceEntryIds?: ReadonlySet<number>,
) {
  const upcomingIds = new Set(state.sourceQueue.map((item) => item.queueItemId));
  const indexes = new Map<number, number>();
  items.forEach((item, index) => {
    if (
      !isQueueItem(item) ||
      !isSourceItem(state, item, sourceEntryIds) ||
      item.origin.kind !== "source"
    )
      return;
    const previousIndex = indexes.get(item.origin.sourceEntryId);
    const previousItem = previousIndex === undefined ? undefined : items[previousIndex];

    if (previousItem && isQueueItem(previousItem)) {
      if (previousItem.queueItemId === state.current?.item.queueItemId) return;

      if (
        item.queueItemId !== state.current?.item.queueItemId &&
        upcomingIds.has(previousItem.queueItemId)
      )
        return;
    }

    indexes.set(item.origin.sourceEntryId, index);
  });

  return indexes;
}

function appendNewLibraryTracks(state: QueueState, entries: readonly SourceEntry[]): QueueState {
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

function appendCurrentSource(state: QueueState) {
  return state.current?.participatesInSourceNavigation
    ? [...state.previousSourceItems, state.current.item]
    : state.previousSourceItems;
}

function findSourceAnchor(
  state: QueueState,
  sourceQueue: readonly QueueItem[],
  insertionIndex: number,
) {
  const sourceEntryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  const nextSource = sourceQueue.find(
    (item, index) => index >= insertionIndex && isSourceItem(state, item, sourceEntryIds),
  );

  if (nextSource?.origin.kind === "source")
    return { sourceEntryId: nextSource.origin.sourceEntryId, side: "before" as const };

  const previousSourceEntry = sourceQueue.findLast(
    (item, index) => index < insertionIndex && isSourceItem(state, item, sourceEntryIds),
  );

  if (previousSourceEntry?.origin.kind === "source")
    return { sourceEntryId: previousSourceEntry.origin.sourceEntryId, side: "after" as const };

  return undefined;
}

function clearAnchor(state: QueueState, items: readonly QueueItem[], removed: QueueItem) {
  const sourceEntryId =
    isSourceItem(state, removed) && removed.origin.kind === "source"
      ? removed.origin.sourceEntryId
      : null;

  return sourceEntryId !== null
    ? items.map((item) => clearItemAnchor(item, sourceEntryId))
    : [...items];
}

function clearItemAnchor(item: QueueItem, sourceEntryId: number) {
  return item.anchor?.sourceEntryId === sourceEntryId ? { ...item, anchor: undefined } : item;
}

function addUnique(items: readonly number[], value: number) {
  return items.includes(value) ? [...items] : [...items, value];
}

function isActivePlaylist(state: QueueState, playlistId: number) {
  return state.source.kind === "playlist" && state.source.playlistId === playlistId;
}

function isQueueItem(item: QueueItem | { kind: "boundary" }): item is QueueItem {
  return "queueItemId" in item;
}
