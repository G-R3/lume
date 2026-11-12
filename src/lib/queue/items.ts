import type {
  ActivePlayback,
  CurrentRole,
  QueueItem,
  QueueState,
  SourceEntry,
  SourceIdentity,
} from "./model";
import { sameSource } from "./source";

export function sourceQueueItemId(sessionId: string, sourceEntryId: number, visit: number) {
  const base = sessionId + ":source:" + sourceEntryId;

  return visit === 0 ? base : base + ":visit:" + visit;
}

const sourceEntryIdSets = new WeakMap<readonly SourceEntry[], ReadonlySet<number>>();

function sourceEntryIdSet(sourceEntries: readonly SourceEntry[]) {
  let ids = sourceEntryIdSets.get(sourceEntries);

  if (!ids) {
    ids = new Set(sourceEntries.map((entry) => entry.sourceEntryId));
    sourceEntryIdSets.set(sourceEntries, ids);
  }

  return ids;
}

export function activeSourceEntryId(state: QueueState, item: QueueItem) {
  const origin = item.origin;

  return origin.kind === "source" &&
    origin.sessionId === state.sessionId &&
    sameSource(state.source, origin.source) &&
    sourceEntryIdSet(state.sourceEntries).has(origin.sourceEntryId)
    ? origin.sourceEntryId
    : null;
}

export function currentItem(state: QueueState) {
  return state.playback.kind === "active" ? state.playback.current : null;
}

export function playbackItem(state: QueueState) {
  return state.playback.kind === "active" ? state.playback.current : state.playback.lastPlayed;
}

export function sourceStepItem(state: QueueState) {
  return state.playback.kind === "active" && state.playback.role === "source-step"
    ? state.playback.current
    : null;
}

export function currentSourceEntryId(state: QueueState) {
  const item = sourceStepItem(state);

  return item ? activeSourceEntryId(state, item) : null;
}

export function createSourceItems(
  existing: QueueState | null,
  entries: readonly SourceEntry[],
  source: SourceIdentity,
  sessionId: string,
): QueueItem[] {
  const usedIds = new Set(
    existing
      ? [
          ...existing.manualQueue,
          ...existing.sourceQueue,
          ...existing.previousSourceItems,
          playbackItem(existing),
        ].map((item) => item.queueItemId)
      : [],
  );

  return entries.map((entry) => {
    let visit = 0;

    while (usedIds.has(sourceQueueItemId(sessionId, entry.sourceEntryId, visit))) visit++;

    const queueItemId = sourceQueueItemId(sessionId, entry.sourceEntryId, visit);
    usedIds.add(queueItemId);

    return {
      queueItemId,
      trackId: entry.trackId,
      origin: { kind: "source", sourceEntryId: entry.sourceEntryId, source, sessionId },
    };
  });
}

export function playItem(
  item: QueueItem,
  role: CurrentRole,
  status: ActivePlayback["status"] = "playing",
): ActivePlayback {
  return { kind: "active", current: item, status, role };
}

export function historyWithCurrent(state: QueueState) {
  const item = sourceStepItem(state);

  return item ? [...state.previousSourceItems, item] : state.previousSourceItems;
}

export function clearAnchorsTo(state: QueueState, items: readonly QueueItem[], removed: QueueItem) {
  const sourceEntryId = activeSourceEntryId(state, removed);

  return sourceEntryId === null
    ? [...items]
    : items.map((item) => clearItemAnchor(item, sourceEntryId));
}

export function clearItemAnchor(item: QueueItem, sourceEntryId: number) {
  return item.anchor?.sourceEntryId === sourceEntryId ? { ...item, anchor: undefined } : item;
}

export function addUnique(items: readonly number[], value: number) {
  return items.includes(value) ? [...items] : [...items, value];
}

export function isActivePlaylist(state: QueueState, playlistId: number) {
  return state.source.kind === "playlist" && state.source.playlistId === playlistId;
}
