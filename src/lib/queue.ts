import { z } from "zod";
import type { MusicLibrary } from "../../shared/lib";

const databaseId = z.number().int().positive().safe();

const queueItemId = z.string().min(1);

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: databaseId, title: z.string() }),
  z.object({ kind: z.literal("detached"), title: z.string() }),
]);

const queueItemSchema = z.object({
  queueItemId,
  trackId: databaseId,
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("manual") }),
    z.object({ kind: z.literal("source"), sourceEntryId: databaseId }),
  ]),
  anchor: z.object({ sourceEntryId: databaseId, side: z.enum(["before", "after"]) }).optional(),
});

const queueStateSchema = z.object({
  source: sourceSchema,
  sessionId: queueItemId,
  current: z
    .object({
      item: queueItemSchema,
      lane: z.enum(["manual", "source"]),
      hasStartedPlayback: z.boolean(),
      // When true, going forward adds the current track to `previousSourceItems`.
      // Going back puts the current track back in `sourceQueue` so it can be played again.
      // Removing the track from its playlist sets this to false and the
      // audio keeps playing if its currently playing.
      participatesInSourceNavigation: z.boolean(),
    })
    .nullable(),
  manualQueue: z.array(queueItemSchema),
  sourceQueue: z.array(queueItemSchema),

  // Tracks that were played, skipped, or came before the first selected track.
  // The `previous` command uses this list to go back to an earlier track.
  // Unavailable tracks stay in the list but are skipped.
  previousSourceItems: z.array(queueItemSchema),
  suppressedSourceEntryIds: z.array(databaseId),
  playedQueueItemIds: z.array(queueItemId),
  status: z.enum(["playing", "paused", "stopped"]),
  lastSelectedItem: queueItemSchema.nullable(),
});

const savedSessionSchema = z.object({
  version: z.literal(3),
  state: queueStateSchema,
  position: z.number().finite().nonnegative(),
});

export type SourceRef = z.infer<typeof sourceSchema>;

export type QueueItem = z.infer<typeof queueItemSchema>;

export type QueueState = z.infer<typeof queueStateSchema>;

export type QueueLane = "manual" | "source";

export type SourceEntry = { sourceEntryId: number; trackId: number };

export type QueueCommand =
  | {
      type: "startFromSource";
      source: SourceRef;
      entries: readonly SourceEntry[];
      startEntryId: number;
      sessionId: string;
      startPaused?: boolean;
    }
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
  | { type: "sourceEntryAdded"; playlistId: number; entry: SourceEntry }
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

export function selectCanGoNext(state: QueueState | null, availableTrackIds: ReadonlySet<number>) {
  if (!state) return false;

  return (
    state.manualQueue.length > 0 ||
    state.sourceQueue.length > 0 ||
    (state.current !== null && !availableTrackIds.has(state.current.item.trackId))
  );
}

/**
 * Applies a queue command, such as adding a track or going to the next track.
 * Returns the updated queue. Audio playback is handled by the playback controller.
 */
export function transition(
  state: QueueState | null,
  command: QueueCommand,
  availableTrackIds: ReadonlySet<number>,
): QueueState | null {
  if (command.type === "startFromSource") return startFromSource(state, command);

  if (!state) return null;

  switch (command.type) {
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
      if (!state.current || (state.current.hasStartedPlayback && state.status === "playing"))
        return state;

      return {
        ...state,
        current: { ...state.current, hasStartedPlayback: true },
        status: "playing",
      };
    case "playbackPaused":
      return state.current && state.status !== "paused" ? { ...state, status: "paused" } : state;
    case "sourceEntryAdded":
      return isActivePlaylist(state, command.playlistId)
        ? addSourceEntry(state, command.entry)
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

function startFromSource(
  previous: QueueState | null,
  command: Extract<QueueCommand, { type: "startFromSource" }>,
): QueueState | null {
  const selectedIndex = command.entries.findIndex(
    (item) => item.sourceEntryId === command.startEntryId,
  );

  if (selectedIndex === -1) return previous;

  const items: QueueItem[] = command.entries.map((item) => ({
    queueItemId: command.sessionId + ":source:" + item.sourceEntryId,
    trackId: item.trackId,
    origin: { kind: "source", sourceEntryId: item.sourceEntryId },
  }));

  return {
    source: command.source,
    sessionId: command.sessionId,
    current: {
      item: items[selectedIndex],
      lane: "source",
      hasStartedPlayback: false,
      participatesInSourceNavigation: true,
    },
    manualQueue: previous?.manualQueue ?? [],
    sourceQueue: items.slice(selectedIndex + 1),
    previousSourceItems: items.slice(0, selectedIndex),
    suppressedSourceEntryIds: [],
    playedQueueItemIds: previous ? recordPlayedItem(previous) : [],
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
    state.previousSourceItems.some((item) => item.queueItemId === command.queueItemId) ||
    state.playedQueueItemIds.includes(command.queueItemId)
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
        hasStartedPlayback: false,
        participatesInSourceNavigation: false,
      },
      status: "playing",
      lastSelectedItem: item,
    };
  }

  return { ...state, manualQueue: [...state.manualQueue, item] };
}

function next(state: QueueState, availableTrackIds: ReadonlySet<number>): QueueState {
  const playedQueueItemIds = recordPlayedItem(state);

  const previousSourceItems = appendCurrentSource(state);
  const manualIndex = state.manualQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (manualIndex !== -1) {
    const item = state.manualQueue[manualIndex];

    return {
      ...state,
      current: {
        item,
        lane: "manual",
        hasStartedPlayback: false,
        participatesInSourceNavigation: false,
      },
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSourceItems,
      playedQueueItemIds,
      status: "playing",
      lastSelectedItem: item,
    };
  }

  const sourceIndex = state.sourceQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (sourceIndex !== -1) {
    const item = state.sourceQueue[sourceIndex];

    return {
      ...state,
      current: {
        item,
        lane: "source",
        hasStartedPlayback: false,
        participatesInSourceNavigation: true,
      },
      manualQueue: [],
      previousSourceItems: [...previousSourceItems, ...state.sourceQueue.slice(0, sourceIndex)],
      sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
      playedQueueItemIds,
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
    playedQueueItemIds,
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
    current: {
      item,
      lane: "source",
      hasStartedPlayback: false,
      participatesInSourceNavigation: true,
    },
    previousSourceItems: state.previousSourceItems.slice(0, previousIndex),
    sourceQueue: [
      ...state.previousSourceItems.slice(previousIndex + 1),
      ...(state.current?.participatesInSourceNavigation ? [state.current.item] : []),
      ...state.sourceQueue,
    ],
    playedQueueItemIds: recordPlayedItem(state),
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
        hasStartedPlayback: false,
        participatesInSourceNavigation: false,
      },
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSourceItems: appendCurrentSource(state),
      playedQueueItemIds: recordPlayedItem(state),
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
    current: {
      item,
      lane: "source",
      hasStartedPlayback: false,
      participatesInSourceNavigation: true,
    },
    previousSourceItems: [
      ...appendCurrentSource(state),
      ...state.sourceQueue.slice(0, sourceIndex),
    ],
    sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
    playedQueueItemIds: recordPlayedItem(state),
    status: "playing",
    lastSelectedItem: item,
  };
}

function removeQueueItem(state: QueueState, queueItemId: string): QueueState {
  if (state.manualQueue.some((item) => item.queueItemId === queueItemId)) {
    return {
      ...state,
      manualQueue: state.manualQueue.filter((item) => item.queueItemId !== queueItemId),
    };
  }

  const item = state.sourceQueue.find((candidate) => candidate.queueItemId === queueItemId);

  if (!item) return state;

  return {
    ...state,
    sourceQueue: clearAnchor(
      state.sourceQueue.filter((candidate) => candidate.queueItemId !== queueItemId),
      item,
    ),
    suppressedSourceEntryIds:
      item.origin.kind === "source"
        ? addUnique(state.suppressedSourceEntryIds, item.origin.sourceEntryId)
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
    command.to === "source" && item.origin.kind === "manual"
      ? { ...item, anchor: findSourceAnchor(sourceQueue, insertionIndex) }
      : { ...item, anchor: undefined };

  destination.splice(insertionIndex, 0, movedItem);

  const sourceEntryId = item.origin.kind === "source" ? item.origin.sourceEntryId : null;

  const suppressedSourceEntryIds =
    sourceEntryId === null
      ? state.suppressedSourceEntryIds
      : command.to === "manual"
        ? addUnique(state.suppressedSourceEntryIds, sourceEntryId)
        : state.suppressedSourceEntryIds.filter((id) => id !== sourceEntryId);

  return { ...state, manualQueue, sourceQueue, suppressedSourceEntryIds };
}

function addSourceEntry(state: QueueState, entry: SourceEntry): QueueState {
  if (
    state.suppressedSourceEntryIds.includes(entry.sourceEntryId) ||
    [
      ...state.previousSourceItems,
      ...state.sourceQueue,
      ...(state.current ? [state.current.item] : []),
    ].some(
      (item) => item.origin.kind === "source" && item.origin.sourceEntryId === entry.sourceEntryId,
    )
  )
    return state;

  return {
    ...state,
    sourceQueue: [
      ...state.sourceQueue,
      {
        queueItemId: state.sessionId + ":source:" + entry.sourceEntryId,
        trackId: entry.trackId,
        origin: { kind: "source", sourceEntryId: entry.sourceEntryId },
      },
    ],
  };
}

function removeSourceEntry(state: QueueState, sourceEntryId: number): QueueState {
  const matches = (item: QueueItem) =>
    item.origin.kind === "source" && item.origin.sourceEntryId === sourceEntryId;

  const currentRemoved =
    state.current?.participatesInSourceNavigation && matches(state.current.item);

  return {
    ...state,
    current:
      currentRemoved && state.current
        ? { ...state.current, participatesInSourceNavigation: false }
        : state.current,
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
  if (command.sourceEntryId === command.targetSourceEntryId) return state;

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

  const movedItem = path.find(
    (item) =>
      isQueueItem(item) &&
      item.origin.kind === "source" &&
      item.origin.sourceEntryId === command.sourceEntryId,
  );

  if (!movedItem || !isQueueItem(movedItem)) return state;

  const attached = path.filter(
    (item): item is QueueItem =>
      isQueueItem(item) && item.anchor?.sourceEntryId === command.sourceEntryId,
  );

  const movedIds = new Set([movedItem.queueItemId, ...attached.map((item) => item.queueItemId)]);

  const remaining = path.filter((item) => !isQueueItem(item) || !movedIds.has(item.queueItemId));

  const targetIndex = remaining.findIndex(
    (item) =>
      isQueueItem(item) &&
      item.origin.kind === "source" &&
      item.origin.sourceEntryId === command.targetSourceEntryId,
  );

  const targetGroupIndexes = remaining.flatMap((item, index) =>
    isQueueItem(item) &&
    item.anchor?.sourceEntryId === command.targetSourceEntryId &&
    item.anchor.side === command.side
      ? [index]
      : [],
  );

  const targetPosition = command.orderedSourceEntryIds.indexOf(command.targetSourceEntryId);

  const sourceIndexes = new Map(
    remaining.flatMap((item, index) =>
      isQueueItem(item) && item.origin.kind === "source"
        ? [[item.origin.sourceEntryId, index] as const]
        : [],
    ),
  );

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

function appendNewLibraryTracks(state: QueueState, entries: readonly SourceEntry[]): QueueState {
  if (state.source.kind !== "all-tracks") return state;

  const known = new Set([
    ...state.previousSourceItems.flatMap((item) =>
      item.origin.kind === "source" ? [item.origin.sourceEntryId] : [],
    ),
    ...state.sourceQueue.flatMap((item) =>
      item.origin.kind === "source" ? [item.origin.sourceEntryId] : [],
    ),
    ...(state.current?.item.origin.kind === "source"
      ? [state.current.item.origin.sourceEntryId]
      : []),
    ...state.suppressedSourceEntryIds,
  ]);

  const added = entries.filter((item) => !known.has(item.sourceEntryId));

  if (added.length === 0) return state;

  return {
    ...state,
    sourceQueue: [
      ...state.sourceQueue,
      ...added.map((item) => ({
        queueItemId: state.sessionId + ":source:" + item.sourceEntryId,
        trackId: item.trackId,
        origin: { kind: "source" as const, sourceEntryId: item.sourceEntryId },
      })),
    ],
  };
}

function appendCurrentSource(state: QueueState) {
  return state.current?.participatesInSourceNavigation
    ? [...state.previousSourceItems, state.current.item]
    : state.previousSourceItems;
}

function recordPlayedItem(state: QueueState) {
  return state.current?.hasStartedPlayback
    ? [...state.playedQueueItemIds, state.current.item.queueItemId]
    : state.playedQueueItemIds;
}

function findSourceAnchor(sourceQueue: readonly QueueItem[], insertionIndex: number) {
  const nextSource = sourceQueue.find(
    (item, index) => index >= insertionIndex && item.origin.kind === "source",
  );

  if (nextSource?.origin.kind === "source")
    return { sourceEntryId: nextSource.origin.sourceEntryId, side: "before" as const };

  const previousSourceEntry = sourceQueue.findLast(
    (item, index) => index < insertionIndex && item.origin.kind === "source",
  );

  if (previousSourceEntry?.origin.kind === "source")
    return { sourceEntryId: previousSourceEntry.origin.sourceEntryId, side: "after" as const };

  return undefined;
}

function clearAnchor(items: readonly QueueItem[], removed: QueueItem) {
  const sourceEntryId = removed.origin.kind === "source" ? removed.origin.sourceEntryId : null;

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

export function serializeQueueSession(state: QueueState, position: number) {
  return JSON.stringify({
    version: 3,
    state,
    position: Number.isFinite(position) ? Math.max(0, position) : 0,
  });
}

export function parseQueueSession(raw: string | null, library: MusicLibrary) {
  if (!raw) return null;

  try {
    const parsed = savedSessionSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) return null;

    const state = parsed.data.state;

    const items = [
      ...state.manualQueue,
      ...state.previousSourceItems,
      ...state.sourceQueue,
      ...(state.current ? [state.current.item] : []),
    ];

    if (new Set(items.map((item) => item.queueItemId)).size !== items.length) return null;

    if (state.current === null && state.status !== "stopped") return null;

    const playlistId = state.source.kind === "playlist" ? state.source.playlistId : null;

    const source =
      state.source.kind === "playlist" &&
      playlistId !== null &&
      !library.playlists.some((playlist) => playlist.id === playlistId)
        ? { kind: "detached" as const, title: state.source.title }
        : state.source;

    return {
      state: {
        ...state,
        source,
        status: state.current ? ("paused" as const) : ("stopped" as const),
      },
      position: parsed.data.position,
    };
  } catch {
    return null;
  }
}
