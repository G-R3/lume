import { z } from "zod";
import type { MusicLibrary } from "../../shared/lib";
import { queueStateSchema, type QueueItem, type QueueState } from "./queue-model";

const savedSessionSchema = z.object({
  version: z.literal(4),
  state: queueStateSchema,
  position: z.number().finite().nonnegative(),
});

export function serializeQueueSession(state: QueueState, position: number) {
  return JSON.stringify({
    version: 4,
    state,
    position: Number.isFinite(position) ? Math.max(0, position) : 0,
  });
}

export function parseQueueSession(raw: string | null, library: MusicLibrary) {
  if (!raw) return null;

  try {
    const input: unknown = JSON.parse(raw);
    const parsed = savedSessionSchema.safeParse(input);

    if (!parsed.success) return null;

    const state = parsed.data.state;

    if (!validQueueState(state)) return null;

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
          JSON.stringify(selected.origin) !== JSON.stringify(state.lastSelectedItem.origin))
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
      position: parsed.data.position,
    };
  } catch {
    return null;
  }
}

function validQueueState(state: QueueState) {
  if (
    state.source.kind !== "detached" &&
    !(
      state.sourceIdentity.kind === state.source.kind &&
      (state.source.kind === "all-tracks" ||
        (state.sourceIdentity.kind === "playlist" &&
          state.sourceIdentity.playlistId === state.source.playlistId))
    )
  )
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

/** check each item's source and session. Allow retained items from earlier sessions */
function validQueueItem(
  state: QueueState,
  item: QueueItem,
  entriesById: ReadonlyMap<number, QueueState["sourceEntries"][number]>,
) {
  if (item.anchor && !entriesById.has(item.anchor.sourceEntryId)) return false;

  if (item.origin.kind !== "source" || item.origin.sessionId !== state.sessionId) return true;

  if (item.origin.source.kind !== state.sourceIdentity.kind) return false;

  if (
    item.origin.source.kind === "playlist" &&
    (state.sourceIdentity.kind !== "playlist" ||
      item.origin.source.playlistId !== state.sourceIdentity.playlistId)
  )
    return false;

  const entry = entriesById.get(item.origin.sourceEntryId);

  return !entry || entry.trackId === item.trackId;
}
