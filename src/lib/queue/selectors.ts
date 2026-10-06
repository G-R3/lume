import { currentSourceEntryId } from "./items";
import type { QueueState } from "./model";

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

/** Returns the current source entry ID for highlighting its table row. Detached sources have no rows. */
export function selectActiveSourceEntryId(state: QueueState | null) {
  return state && state.source.kind !== "detached" ? currentSourceEntryId(state) : null;
}

export function selectCanGoNext(state: QueueState | null, availableTrackIds: ReadonlySet<number>) {
  if (!state) return false;

  return (
    state.manualQueue.length > 0 ||
    state.sourceQueue.length > 0 ||
    (state.current !== null && !availableTrackIds.has(state.current.item.trackId))
  );
}
