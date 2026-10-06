import type { QueueItem, QueueLane, QueueState, SourceEntry, SourceIdentity } from "./model";
import { sameSource } from "./source";

/**
 * Source items are named `<session>:source:<entry>`. Later visits of the same occurrence add
 * `:visit:<n>`. Saved sessions rebuild these IDs, so both must use this function.
 */
export function sourceQueueItemId(sessionId: string, sourceEntryId: number, visit: number) {
  const base = sessionId + ":source:" + sourceEntryId;

  return visit === 0 ? base : base + ":visit:" + visit;
}

/** Returns the visit encoded by sourceQueueItemId, or null when the ID has another form. */
export function sourceItemVisit(queueItemId: string, sessionId: string, sourceEntryId: number) {
  const firstVisitId = sourceQueueItemId(sessionId, sourceEntryId, 0);

  if (queueItemId === firstVisitId) return 0;

  const visitPrefix = firstVisitId + ":visit:";

  if (!queueItemId.startsWith(visitPrefix)) return null;

  const visit = Number(queueItemId.slice(visitPrefix.length));

  return Number.isSafeInteger(visit) &&
    visit > 0 &&
    queueItemId === sourceQueueItemId(sessionId, sourceEntryId, visit)
    ? visit
    : null;
}

// sourceEntries arrays are never changed in place, so each array keeps one ID set.
const sourceEntryIdSets = new WeakMap<readonly SourceEntry[], ReadonlySet<number>>();

function sourceEntryIdSet(sourceEntries: readonly SourceEntry[]) {
  let ids = sourceEntryIdSets.get(sourceEntries);

  if (!ids) {
    ids = new Set(sourceEntries.map((entry) => entry.sourceEntryId));
    sourceEntryIdSets.set(sourceEntries, ids);
  }

  return ids;
}

/**
 * Returns the item's source entry ID when the item belongs to the active source session and its
 * occurrence is still in sourceEntries. Returns null for manual items, items from other sessions,
 * and items whose occurrence was deleted. The queue treats those as queue-only items.
 */
export function activeSourceEntryId(state: QueueState, item: QueueItem) {
  const origin = item.origin;

  return origin.kind === "source" &&
    origin.sessionId === state.sessionId &&
    sameSource(state.sourceIdentity, origin.source) &&
    sourceEntryIdSet(state.sourceEntries).has(origin.sourceEntryId)
    ? origin.sourceEntryId
    : null;
}

export function currentSourceEntryId(state: QueueState) {
  return state.current?.participatesInSourceNavigation
    ? activeSourceEntryId(state, state.current.item)
    : null;
}

/** Creates source queue items with IDs that differ from every queue item ID stored in `existing`. */
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
          ...(existing.current ? [existing.current.item] : []),
          ...(existing.lastSelectedItem ? [existing.lastSelectedItem] : []),
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

export function playAs(item: QueueItem, lane: QueueLane) {
  return { item, lane, participatesInSourceNavigation: lane === "source" };
}

export function historyWithCurrent(state: QueueState) {
  return state.current?.participatesInSourceNavigation
    ? [...state.previousSourceItems, state.current.item]
    : state.previousSourceItems;
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
