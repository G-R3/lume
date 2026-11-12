import { currentItem, currentSourceEntryId, playbackItem } from "./items";
import type { QueueState } from "./model";

export function selectCurrentItem(state: QueueState | null) {
  return state ? currentItem(state) : null;
}

export function selectDisplayItem(state: QueueState | null) {
  return state ? playbackItem(state) : null;
}

export function selectPlaybackStatus(state: QueueState | null) {
  return state?.playback.kind === "active" ? state.playback.status : "stopped";
}

export function selectQueueView(state: QueueState | null) {
  if (!state) return null;

  return {
    source: state.source,
    current: currentItem(state),
    finished: state.playback.kind === "stopped",
    manualQueue: state.manualQueue,
    sourceQueue: state.sourceQueue,
  };
}

export function selectActiveSourcePlaylistId(state: QueueState | null) {
  return state?.source.kind === "playlist" ? state.source.playlistId : null;
}

export function selectActiveSourceEntryId(state: QueueState | null) {
  return state && state.source.kind !== "deleted-playlist" ? currentSourceEntryId(state) : null;
}

export function selectCanGoNext(state: QueueState | null, availableTrackIds: ReadonlySet<number>) {
  if (!state) return false;

  const current = currentItem(state);

  return (
    state.manualQueue.length > 0 ||
    state.sourceQueue.length > 0 ||
    (current !== null && !availableTrackIds.has(current.trackId))
  );
}
