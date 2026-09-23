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
    z.object({ kind: z.literal("source"), occurrenceId: databaseId }),
  ]),
  anchor: z.object({ occurrenceId: databaseId, side: z.enum(["before", "after"]) }).optional(),
});

const queueStateSchema = z.object({
  source: sourceSchema,
  sessionId: queueItemId,
  current: z
    .object({
      item: queueItemSchema,
      lane: z.enum(["manual", "source"]),
      started: z.boolean(),
      inSourceNavigation: z.boolean(),
    })
    .nullable(),
  manualQueue: z.array(queueItemSchema),
  sourceQueue: z.array(queueItemSchema),
  previousSource: z.array(queueItemSchema),
  suppressedSourceOccurrenceIds: z.array(databaseId),
  playedQueueItemIds: z.array(queueItemId),
  status: z.enum(["playing", "paused", "stopped"]),
  lastItem: queueItemSchema.nullable(),
});

const savedSessionSchema = z.object({
  version: z.literal(2),
  state: queueStateSchema,
  position: z.number().finite().nonnegative(),
});

export type SourceRef = z.infer<typeof sourceSchema>;

export type QueueItem = z.infer<typeof queueItemSchema>;

export type QueueState = z.infer<typeof queueStateSchema>;

export type QueueLane = "manual" | "source";

export type SourceOccurrence = { occurrenceId: number; trackId: number };

export type QueueCommand =
  | {
      type: "startFromSource";
      source: SourceRef;
      occurrences: readonly SourceOccurrence[];
      atOccurrenceId: number;
      sessionId: string;
    }
  | { type: "addNext"; trackId: number; queueItemId: string }
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
  | { type: "sourceEntryAdded"; playlistId: number; entry: SourceOccurrence }
  | { type: "sourceEntryRemoved"; playlistId: number; occurrenceId: number }
  | {
      type: "sourceEntryMoved";
      playlistId: number;
      occurrenceId: number;
      targetOccurrenceId: number;
      side: "before" | "after";
      orderedOccurrenceIds: readonly number[];
    }
  | { type: "sourceDeleted"; playlistId: number }
  | { type: "libraryRescanned"; occurrences: readonly SourceOccurrence[] };

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
  return Boolean(
    state?.manualQueue.some((item) => availableTrackIds.has(item.trackId)) ||
    state?.sourceQueue.some((item) => availableTrackIds.has(item.trackId)),
  );
}

export function transition(
  state: QueueState | null,
  command: QueueCommand,
  availableTrackIds: ReadonlySet<number>,
): QueueState | null {
  if (command.type === "startFromSource") return startFromSource(state, command);

  if (!state) return null;

  switch (command.type) {
    case "addNext":
      return addNext(state, command);
    case "jumpTo":
      return jumpTo(state, command.queueItemId, availableTrackIds);
    case "moveQueueItem":
      return moveQueueItem(state, command);
    case "removeQueueItem":
      return removeQueueItem(state, command.queueItemId);
    case "next":
      return next(state, command.reason, availableTrackIds);
    case "previous":
      return previous(state, availableTrackIds);
    case "playbackStarted":
      if (!state.current || (state.current.started && state.status === "playing")) return state;

      return {
        ...state,
        current: { ...state.current, started: true },
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
        ? removeSourceEntry(state, command.occurrenceId)
        : state;
    case "sourceEntryMoved":
      return isActivePlaylist(state, command.playlistId) ? moveSourceEntry(state, command) : state;
    case "sourceDeleted":
      return state.source.kind === "playlist" && state.source.playlistId === command.playlistId
        ? { ...state, source: { kind: "detached", title: state.source.title } }
        : state;
    case "libraryRescanned":
      return reconcileAllTracks(state, command.occurrences);
  }
}

function startFromSource(
  previous: QueueState | null,
  command: Extract<QueueCommand, { type: "startFromSource" }>,
): QueueState | null {
  const selectedIndex = command.occurrences.findIndex(
    (item) => item.occurrenceId === command.atOccurrenceId,
  );

  if (selectedIndex === -1) return previous;

  const items: QueueItem[] = command.occurrences.map((item) => ({
    queueItemId: command.sessionId + ":source:" + item.occurrenceId,
    trackId: item.trackId,
    origin: { kind: "source", occurrenceId: item.occurrenceId },
  }));

  return {
    source: command.source,
    sessionId: command.sessionId,
    current: {
      item: items[selectedIndex],
      lane: "source",
      started: false,
      inSourceNavigation: true,
    },
    manualQueue: previous?.manualQueue ?? [],
    sourceQueue: items.slice(selectedIndex + 1),
    previousSource: items.slice(0, selectedIndex),
    suppressedSourceOccurrenceIds: [],
    playedQueueItemIds: [],
    status: "playing",
    lastItem: items[selectedIndex],
  };
}

function addNext(
  state: QueueState,
  command: Extract<QueueCommand, { type: "addNext" }>,
): QueueState {
  if (
    state.current?.item.queueItemId === command.queueItemId ||
    state.lastItem?.queueItemId === command.queueItemId ||
    state.manualQueue.some((item) => item.queueItemId === command.queueItemId) ||
    state.sourceQueue.some((item) => item.queueItemId === command.queueItemId) ||
    state.previousSource.some((item) => item.queueItemId === command.queueItemId) ||
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
      current: { item, lane: "manual", started: false, inSourceNavigation: false },
      status: "playing",
      lastItem: item,
    };
  }

  return { ...state, manualQueue: [...state.manualQueue, item] };
}

function next(
  state: QueueState,
  reason: Extract<QueueCommand, { type: "next" }>["reason"],
  availableTrackIds: ReadonlySet<number>,
): QueueState {
  const playedQueueItemIds =
    reason === "error" ? state.playedQueueItemIds : recordPlayedItem(state);

  const previousSource = appendCurrentSource(state);
  const manualIndex = state.manualQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (manualIndex !== -1) {
    const item = state.manualQueue[manualIndex];

    return {
      ...state,
      current: { item, lane: "manual", started: false, inSourceNavigation: false },
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSource,
      playedQueueItemIds,
      status: "playing",
      lastItem: item,
    };
  }

  const sourceIndex = state.sourceQueue.findIndex((item) => availableTrackIds.has(item.trackId));

  if (sourceIndex !== -1) {
    const item = state.sourceQueue[sourceIndex];

    return {
      ...state,
      current: { item, lane: "source", started: false, inSourceNavigation: true },
      manualQueue: [],
      previousSource: [...previousSource, ...state.sourceQueue.slice(0, sourceIndex)],
      sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
      playedQueueItemIds,
      status: "playing",
      lastItem: item,
    };
  }

  return {
    ...state,
    current: null,
    manualQueue: [],
    previousSource,
    playedQueueItemIds,
    status: "stopped",
  };
}

function previous(state: QueueState, availableTrackIds: ReadonlySet<number>): QueueState {
  const previousIndex = state.previousSource.findLastIndex((item) =>
    availableTrackIds.has(item.trackId),
  );

  if (previousIndex === -1) return state;

  const item = state.previousSource[previousIndex];

  return {
    ...state,
    current: { item, lane: "source", started: false, inSourceNavigation: true },
    previousSource: state.previousSource.slice(0, previousIndex),
    sourceQueue: [
      ...state.previousSource.slice(previousIndex + 1),
      ...(state.current?.inSourceNavigation ? [state.current.item] : []),
      ...state.sourceQueue,
    ],
    playedQueueItemIds: recordPlayedItem(state),
    status: "playing",
    lastItem: item,
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
      current: { item, lane: "manual", started: false, inSourceNavigation: false },
      manualQueue: state.manualQueue.slice(manualIndex + 1),
      previousSource: appendCurrentSource(state),
      playedQueueItemIds: recordPlayedItem(state),
      status: "playing",
      lastItem: item,
    };
  }

  const sourceIndex = state.sourceQueue.findIndex((item) => item.queueItemId === queueItemId);

  if (sourceIndex === -1) return state;
  const item = state.sourceQueue[sourceIndex];

  if (!availableTrackIds.has(item.trackId)) return state;

  return {
    ...state,
    current: { item, lane: "source", started: false, inSourceNavigation: true },
    previousSource: [...appendCurrentSource(state), ...state.sourceQueue.slice(0, sourceIndex)],
    sourceQueue: state.sourceQueue.slice(sourceIndex + 1),
    playedQueueItemIds: recordPlayedItem(state),
    status: "playing",
    lastItem: item,
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
    suppressedSourceOccurrenceIds:
      item.origin.kind === "source"
        ? addUnique(state.suppressedSourceOccurrenceIds, item.origin.occurrenceId)
        : state.suppressedSourceOccurrenceIds,
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

  const sourceOccurrenceId = item.origin.kind === "source" ? item.origin.occurrenceId : null;

  const suppressedSourceOccurrenceIds =
    sourceOccurrenceId === null
      ? state.suppressedSourceOccurrenceIds
      : command.to === "manual"
        ? addUnique(state.suppressedSourceOccurrenceIds, sourceOccurrenceId)
        : state.suppressedSourceOccurrenceIds.filter((id) => id !== sourceOccurrenceId);

  return { ...state, manualQueue, sourceQueue, suppressedSourceOccurrenceIds };
}

function addSourceEntry(state: QueueState, entry: SourceOccurrence): QueueState {
  if (
    state.suppressedSourceOccurrenceIds.includes(entry.occurrenceId) ||
    [
      ...state.previousSource,
      ...state.sourceQueue,
      ...(state.current ? [state.current.item] : []),
    ].some(
      (item) => item.origin.kind === "source" && item.origin.occurrenceId === entry.occurrenceId,
    )
  )
    return state;

  return {
    ...state,
    sourceQueue: [
      ...state.sourceQueue,
      {
        queueItemId: state.sessionId + ":source:" + entry.occurrenceId,
        trackId: entry.trackId,
        origin: { kind: "source", occurrenceId: entry.occurrenceId },
      },
    ],
  };
}

function removeSourceEntry(state: QueueState, occurrenceId: number): QueueState {
  const matches = (item: QueueItem) =>
    item.origin.kind === "source" && item.origin.occurrenceId === occurrenceId;

  const currentRemoved = state.current?.inSourceNavigation && matches(state.current.item);

  return {
    ...state,
    current:
      currentRemoved && state.current
        ? { ...state.current, inSourceNavigation: false }
        : state.current,
    previousSource: state.previousSource
      .filter((item) => !matches(item))
      .map((item) => clearItemAnchor(item, occurrenceId)),
    sourceQueue: state.sourceQueue
      .filter((item) => !matches(item))
      .map((item) => clearItemAnchor(item, occurrenceId)),
    suppressedSourceOccurrenceIds: state.suppressedSourceOccurrenceIds.filter(
      (id) => id !== occurrenceId,
    ),
  };
}

function moveSourceEntry(
  state: QueueState,
  command: Extract<QueueCommand, { type: "sourceEntryMoved" }>,
): QueueState {
  if (command.occurrenceId === command.targetOccurrenceId) return state;

  const boundary = { kind: "boundary" as const };

  const marker =
    state.current?.inSourceNavigation && state.current.lane === "source"
      ? state.current.item
      : boundary;

  const path: (QueueItem | typeof boundary)[] = [
    ...state.previousSource,
    marker,
    ...state.sourceQueue,
  ];

  const movedItem = path.find(
    (item) =>
      isQueueItem(item) &&
      item.origin.kind === "source" &&
      item.origin.occurrenceId === command.occurrenceId,
  );

  if (!movedItem || !isQueueItem(movedItem)) return state;

  const attached = path.filter(
    (item): item is QueueItem =>
      isQueueItem(item) && item.anchor?.occurrenceId === command.occurrenceId,
  );

  const movedIds = new Set([movedItem.queueItemId, ...attached.map((item) => item.queueItemId)]);

  const remaining = path.filter((item) => !isQueueItem(item) || !movedIds.has(item.queueItemId));

  const targetIndex = remaining.findIndex(
    (item) =>
      isQueueItem(item) &&
      item.origin.kind === "source" &&
      item.origin.occurrenceId === command.targetOccurrenceId,
  );

  const targetGroupIndexes = remaining.flatMap((item, index) =>
    isQueueItem(item) &&
    item.anchor?.occurrenceId === command.targetOccurrenceId &&
    item.anchor.side === command.side
      ? [index]
      : [],
  );

  const targetPosition = command.orderedOccurrenceIds.indexOf(command.targetOccurrenceId);

  const sourceIndexes = new Map(
    remaining.flatMap((item, index) =>
      isQueueItem(item) && item.origin.kind === "source"
        ? [[item.origin.occurrenceId, index] as const]
        : [],
    ),
  );

  const fallbackIndex =
    targetPosition === -1
      ? undefined
      : command.orderedOccurrenceIds
          .slice(targetPosition + 1)
          .map((occurrenceId) => sourceIndexes.get(occurrenceId))
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
    previousSource: remaining.slice(0, currentIndex).filter(isQueueItem),
    sourceQueue: remaining.slice(currentIndex + 1).filter(isQueueItem),
  };
}

function reconcileAllTracks(
  state: QueueState,
  occurrences: readonly SourceOccurrence[],
): QueueState {
  if (state.source.kind !== "all-tracks") return state;

  const known = new Set([
    ...state.previousSource.flatMap((item) =>
      item.origin.kind === "source" ? [item.origin.occurrenceId] : [],
    ),
    ...state.sourceQueue.flatMap((item) =>
      item.origin.kind === "source" ? [item.origin.occurrenceId] : [],
    ),
    ...(state.current?.item.origin.kind === "source"
      ? [state.current.item.origin.occurrenceId]
      : []),
    ...state.suppressedSourceOccurrenceIds,
  ]);

  const added = occurrences.filter((item) => !known.has(item.occurrenceId));

  if (added.length === 0) return state;

  return {
    ...state,
    sourceQueue: [
      ...state.sourceQueue,
      ...added.map((item) => ({
        queueItemId: state.sessionId + ":source:" + item.occurrenceId,
        trackId: item.trackId,
        origin: { kind: "source" as const, occurrenceId: item.occurrenceId },
      })),
    ],
  };
}

function appendCurrentSource(state: QueueState) {
  return state.current?.inSourceNavigation
    ? [...state.previousSource, state.current.item]
    : state.previousSource;
}

function recordPlayedItem(state: QueueState) {
  return state.current?.started
    ? [...state.playedQueueItemIds, state.current.item.queueItemId]
    : state.playedQueueItemIds;
}

function findSourceAnchor(sourceQueue: readonly QueueItem[], insertionIndex: number) {
  const nextSource = sourceQueue.find(
    (item, index) => index >= insertionIndex && item.origin.kind === "source",
  );

  if (nextSource?.origin.kind === "source")
    return { occurrenceId: nextSource.origin.occurrenceId, side: "before" as const };

  const previousSource = sourceQueue.findLast(
    (item, index) => index < insertionIndex && item.origin.kind === "source",
  );

  if (previousSource?.origin.kind === "source")
    return { occurrenceId: previousSource.origin.occurrenceId, side: "after" as const };

  return undefined;
}

function clearAnchor(items: readonly QueueItem[], removed: QueueItem) {
  const occurrenceId = removed.origin.kind === "source" ? removed.origin.occurrenceId : null;

  return occurrenceId !== null
    ? items.map((item) => clearItemAnchor(item, occurrenceId))
    : [...items];
}

function clearItemAnchor(item: QueueItem, occurrenceId: number) {
  return item.anchor?.occurrenceId === occurrenceId ? { ...item, anchor: undefined } : item;
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
    version: 2,
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
      ...state.previousSource,
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
