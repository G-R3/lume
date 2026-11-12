import { z } from "zod";
import type { MusicLibrary, SavedPlaybackSession } from "../../../shared/lib";
import { sameSource } from "./source";
import { queueStateSchema, type QueueItem, type QueueState } from "./model";

const positionSchema = z.number().finite().nonnegative();

export function serializeQueueSession(state: QueueState) {
  return JSON.stringify(state);
}

export function parseQueueSession(saved: SavedPlaybackSession | null, library: MusicLibrary) {
  if (!saved || !positionSchema.safeParse(saved.position).success) return null;

  try {
    const parsed = queueStateSchema.safeParse(JSON.parse(saved.payload));

    if (!parsed.success || !validQueueState(parsed.data)) return null;

    const state = parsed.data;

    const items = [
      ...state.manualQueue,
      ...state.previousSourceItems,
      ...state.sourceQueue,
      ...(state.current ? [state.current.item] : []),
    ];

    if (new Set(items.map((item) => item.queueItemId)).size !== items.length) return null;

    if ((state.current === null) !== (state.status === "stopped")) return null;

    if (state.current?.lane === "manual" && state.current.participatesInSourceNavigation)
      return null;

    if (new Set(state.suppressedSourceEntryIds).size !== state.suppressedSourceEntryIds.length)
      return null;

    const entriesById = new Map(state.sourceEntries.map((entry) => [entry.sourceEntryId, entry]));

    if (state.suppressedSourceEntryIds.some((id) => !entriesById.has(id))) return null;

    const retainedItems = state.lastSelectedItem ? [...items, state.lastSelectedItem] : items;

    if (retainedItems.some((item) => !validQueueItem(state, item, entriesById))) return null;

    if (state.lastSelectedItem) {
      const selected = items.find(
        (item) => item.queueItemId === state.lastSelectedItem?.queueItemId,
      );

      if (
        selected &&
        (selected.trackId !== state.lastSelectedItem.trackId ||
          !sameOrigin(selected.origin, state.lastSelectedItem.origin))
      )
        return null;
    }

    const playlistId = state.source.kind === "playlist" ? state.source.playlistId : null;

    const source =
      state.source.kind === "playlist" &&
      !library.playlists.some((playlist) => playlist.id === playlistId)
        ? { kind: "detached" as const, title: state.source.title }
        : state.source;

    return {
      state: {
        ...state,
        source,
        status: state.current ? ("paused" as const) : ("stopped" as const),
      },
      position: saved.position,
    };
  } catch {
    return null;
  }
}

function validQueueState(state: QueueState) {
  if (state.source.kind !== "detached" && !sameSource(state.sourceIdentity, state.source))
    return false;

  const entryIds = new Set(state.sourceEntries.map((entry) => entry.sourceEntryId));

  if (entryIds.size !== state.sourceEntries.length) return false;

  if (state.sourcePosition?.kind === "entry" && !entryIds.has(state.sourcePosition.sourceEntryId))
    return false;

  if (
    state.sourcePosition?.kind === "boundary" &&
    state.sourcePosition.index > state.sourceEntries.length
  )
    return false;

  return true;
}

function validQueueItem(
  state: QueueState,
  item: QueueItem,
  entriesById: ReadonlyMap<number, QueueState["sourceEntries"][number]>,
) {
  if (item.anchor && !entriesById.has(item.anchor.sourceEntryId)) return false;

  if (item.origin.kind !== "source" || item.origin.sessionId !== state.sessionId) return true;

  if (!sameSource(item.origin.source, state.sourceIdentity)) return false;

  const entry = entriesById.get(item.origin.sourceEntryId);

  return !entry || entry.trackId === item.trackId;
}

function sameOrigin(left: QueueItem["origin"], right: QueueItem["origin"]) {
  if (left.kind === "manual" || right.kind === "manual") return left.kind === right.kind;

  return (
    left.sourceEntryId === right.sourceEntryId &&
    left.sessionId === right.sessionId &&
    sameSource(left.source, right.source)
  );
}
