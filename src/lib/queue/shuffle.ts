import {
  activeSourceEntryId,
  createSourceItems,
  currentSourceEntryId,
  historyWithCurrent,
  playAs,
} from "./items";
import { sameSource } from "./source";
import type { QueueRandom } from "./commands";
import type { QueueItem, QueueState, SourceIdentity } from "./model";

/**
 * Turns shuffle on or off without changing the current item.
 * Turning it on shuffles every eligible source entry, including entries before the current one.
 * Turning it off restores source order after sourcePosition.
 * Setting the current value returns the same state object.
 */
export function setShuffleEnabled(
  state: QueueState,
  enabled: boolean,
  random: QueueRandom,
): QueueState {
  if (state.shuffleEnabled === enabled) return state;

  const currentEntryId = currentSourceEntryId(state);
  const suppressedEntryIds = new Set(state.suppressedSourceEntryIds);

  const manualEntryIds = new Set(
    state.manualQueue.flatMap((item) => {
      const sourceEntryId = activeSourceEntryId(state, item);

      return sourceEntryId === null ? [] : [sourceEntryId];
    }),
  );

  const position = state.sourcePosition;

  const continuationIndex =
    position?.kind === "entry"
      ? state.sourceEntries.findIndex((entry) => entry.sourceEntryId === position.sourceEntryId) + 1
      : position?.kind === "boundary"
        ? position.index
        : 0;

  const eligibleEntries = state.sourceEntries.filter(
    (entry, index) =>
      (enabled || index >= continuationIndex) &&
      entry.sourceEntryId !== currentEntryId &&
      !suppressedEntryIds.has(entry.sourceEntryId) &&
      !manualEntryIds.has(entry.sourceEntryId),
  );

  const entries = enabled ? random.shuffle(eligibleEntries) : eligibleEntries;

  // Keep the queued items for entries that are already upcoming, and create the others.
  const itemsByEntry = new Map<number, QueueItem>();
  const queueOnlyItems: QueueItem[] = [];

  state.sourceQueue.forEach((item) => {
    const sourceEntryId = activeSourceEntryId(state, item);

    if (sourceEntryId === null) queueOnlyItems.push(item);
    else itemsByEntry.set(sourceEntryId, item);
  });

  const missingEntries = entries.filter((entry) => !itemsByEntry.has(entry.sourceEntryId));

  createSourceItems(state, missingEntries, state.sourceIdentity, state.sessionId).forEach(
    (item, index) => itemsByEntry.set(missingEntries[index].sourceEntryId, item),
  );

  // Keep queue-only items in their chosen order around each source entry.
  const before = new Map<number, QueueItem[]>();
  const after = new Map<number, QueueItem[]>();

  queueOnlyItems.forEach((item) => {
    if (!item.anchor) return;

    const groups = item.anchor.side === "before" ? before : after;
    const group = groups.get(item.anchor.sourceEntryId) ?? [];

    group.push(item);
    groups.set(item.anchor.sourceEntryId, group);
  });

  const includedEntryIds = new Set(entries.map((entry) => entry.sourceEntryId));

  return {
    ...state,
    shuffleEnabled: enabled,
    sourceQueue: [
      ...entries.flatMap((entry) => {
        const item = itemsByEntry.get(entry.sourceEntryId);

        return item
          ? [
              ...(before.get(entry.sourceEntryId) ?? []),
              item,
              ...(after.get(entry.sourceEntryId) ?? []),
            ]
          : [];
      }),
      ...queueOnlyItems.filter(
        (item) => !item.anchor || !includedEntryIds.has(item.anchor.sourceEntryId),
      ),
    ],
  };
}

/**
 * Returns true when a table selection from this source plays within the current shuffled session.
 * Other selections start a new session from the source.
 */
export function selectsWithinShuffledSession(state: QueueState | null, source: SourceIdentity) {
  return (
    state !== null &&
    state.shuffleEnabled &&
    state.source.kind !== "detached" &&
    sameSource(state.sourceIdentity, source)
  );
}

/**
 * Plays a source entry in the current shuffled session. An upcoming entry leaves the queue, and
 * the other upcoming items keep their order. Selecting the current entry plays it again.
 */
export function selectSourceEntry(
  state: QueueState,
  source: SourceIdentity,
  sourceEntryId: number,
  availableTrackIds: ReadonlySet<number>,
): QueueState {
  if (!selectsWithinShuffledSession(state, source)) return state;

  const entry = state.sourceEntries.find((candidate) => candidate.sourceEntryId === sourceEntryId);

  if (!entry || !availableTrackIds.has(entry.trackId)) return state;

  if (currentSourceEntryId(state) === sourceEntryId) return { ...state, status: "playing" };

  const item =
    state.sourceQueue.find((queued) => activeSourceEntryId(state, queued) === sourceEntryId) ??
    createSourceItems(state, [entry], state.sourceIdentity, state.sessionId)[0];

  return {
    ...state,
    sourcePosition: { kind: "entry", sourceEntryId },
    current: playAs(item, "source"),
    sourceQueue: state.sourceQueue.filter((queued) => queued.queueItemId !== item.queueItemId),
    previousSourceItems: historyWithCurrent(state),
    lastSelectedItem: item,
    status: "playing",
  };
}
