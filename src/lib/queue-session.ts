import { z } from "zod";
import type { MusicLibrary, SavedPlaybackSession } from "../../shared/lib";
import {
  databaseId,
  queueItemSchema,
  queueStateSchema,
  type QueueItem,
  type QueueState,
} from "./queue-model";

// A source item from the current session is saved as its source entry ID, or as
// [source entry ID, visit] for a repeated visit. Restoring rebuilds its queue item ID, track ID,
// and origin from the session. Every other item is saved in full.
const savedItemSchema = z.union([
  databaseId.transform((sourceEntryId) => ({ kind: "short" as const, sourceEntryId, visit: 0 })),
  z
    .tuple([databaseId, z.number().int().positive().safe()])
    .transform(([sourceEntryId, visit]) => ({ kind: "short" as const, sourceEntryId, visit })),
  queueItemSchema.transform((item) => ({ kind: "full" as const, item })),
]);

type SavedItem = z.input<typeof savedItemSchema>;

const savedSessionSchema = z.object({
  version: z.literal(5),
  state: queueStateSchema.extend({
    sourceEntries: z.array(z.tuple([databaseId, databaseId])),
    current: queueStateSchema.shape.current.unwrap().extend({ item: savedItemSchema }).nullable(),
    manualQueue: z.array(savedItemSchema),
    sourceQueue: z.array(savedItemSchema),
    previousSourceItems: z.array(savedItemSchema),
    lastSelectedItem: savedItemSchema.nullable(),
  }),
});

const positionSchema = z.number().finite().nonnegative();

/** Serialize the queue. The playback position is saved separately. */
export function serializeQueueSession(state: QueueState) {
  const trackIdsByEntry = new Map(
    state.sourceEntries.map((entry) => [entry.sourceEntryId, entry.trackId]),
  );

  const save = (item: QueueItem) => saveItem(state, trackIdsByEntry, item);

  return JSON.stringify({
    version: 5,
    state: {
      ...state,
      sourceEntries: state.sourceEntries.map((entry) => [entry.sourceEntryId, entry.trackId]),
      current: state.current && { ...state.current, item: save(state.current.item) },
      manualQueue: state.manualQueue.map(save),
      sourceQueue: state.sourceQueue.map(save),
      previousSourceItems: state.previousSourceItems.map(save),
      lastSelectedItem: state.lastSelectedItem && save(state.lastSelectedItem),
    },
  });
}

export function parseQueueSession(saved: SavedPlaybackSession | null, library: MusicLibrary) {
  if (!saved || !positionSchema.safeParse(saved.position).success) return null;

  try {
    const input: unknown = JSON.parse(saved.payload);
    const parsed = savedSessionSchema.safeParse(input);

    if (!parsed.success) return null;

    const state = restoreItems(parsed.data.state);

    if (!state || !validQueueState(state)) return null;

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
      position: saved.position,
    };
  } catch {
    return null;
  }
}

function sourceItemId(sessionId: string, sourceEntryId: number, visit: number) {
  const base = sessionId + ":source:" + sourceEntryId;

  return visit === 0 ? base : base + ":visit:" + visit;
}

/** Save the short form only when restoring it rebuilds exactly the same item. */
function saveItem(
  state: QueueState,
  trackIdsByEntry: ReadonlyMap<number, number>,
  item: QueueItem,
): SavedItem {
  const origin = item.origin;

  if (
    item.anchor ||
    origin.kind !== "source" ||
    origin.sessionId !== state.sessionId ||
    origin.source.kind !== state.sourceIdentity.kind ||
    (origin.source.kind === "playlist" &&
      state.sourceIdentity.kind === "playlist" &&
      origin.source.playlistId !== state.sourceIdentity.playlistId) ||
    trackIdsByEntry.get(origin.sourceEntryId) !== item.trackId
  )
    return item;

  const visitPrefix = sourceItemId(state.sessionId, origin.sourceEntryId, 0) + ":visit:";

  const visit = item.queueItemId.startsWith(visitPrefix)
    ? Number(item.queueItemId.slice(visitPrefix.length))
    : 0;

  if (
    !Number.isSafeInteger(visit) ||
    visit < 0 ||
    item.queueItemId !== sourceItemId(state.sessionId, origin.sourceEntryId, visit)
  )
    return item;

  return visit === 0 ? origin.sourceEntryId : [origin.sourceEntryId, visit];
}

/** Rebuild saved source entries and short-form items. Returns null for an unknown entry. */
function restoreItems(saved: z.infer<typeof savedSessionSchema>["state"]): QueueState | null {
  const sourceEntries = saved.sourceEntries.map(([sourceEntryId, trackId]) => ({
    sourceEntryId,
    trackId,
  }));

  const entriesById = new Map(sourceEntries.map((entry) => [entry.sourceEntryId, entry]));

  const restore = (item: z.output<typeof savedItemSchema>): QueueItem | null => {
    if (item.kind === "full") return item.item;

    const entry = entriesById.get(item.sourceEntryId);

    if (!entry) return null;

    return {
      queueItemId: sourceItemId(saved.sessionId, item.sourceEntryId, item.visit),
      trackId: entry.trackId,
      origin: {
        kind: "source",
        sourceEntryId: item.sourceEntryId,
        source: saved.sourceIdentity,
        sessionId: saved.sessionId,
      },
    };
  };

  const restoreAll = (items: z.output<typeof savedItemSchema>[]) => {
    const restored = items.map(restore);

    return restored.every((item) => item !== null) ? restored : null;
  };

  const currentItem = saved.current && restore(saved.current.item);
  const lastSelectedItem = saved.lastSelectedItem === null ? null : restore(saved.lastSelectedItem);
  const manualQueue = restoreAll(saved.manualQueue);
  const sourceQueue = restoreAll(saved.sourceQueue);
  const previousSourceItems = restoreAll(saved.previousSourceItems);

  if (
    (saved.current && !currentItem) ||
    (saved.lastSelectedItem !== null && !lastSelectedItem) ||
    !manualQueue ||
    !sourceQueue ||
    !previousSourceItems
  )
    return null;

  return {
    ...saved,
    sourceEntries,
    current: saved.current && currentItem ? { ...saved.current, item: currentItem } : null,
    manualQueue,
    sourceQueue,
    previousSourceItems,
    lastSelectedItem,
  };
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
