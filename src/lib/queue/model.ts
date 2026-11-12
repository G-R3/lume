import { z } from "zod";
import { trackSortSchema } from "../track-sort";
import { sameSource } from "./source";

export const databaseId = z.number().int().positive().safe();

const queueItemId = z.string().min(1);

const sourceIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: databaseId }),
]);

const queueSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: databaseId, title: z.string() }),
  z.object({ kind: z.literal("deleted-playlist"), playlistId: databaseId, title: z.string() }),
]);

const sourceTrackingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("follows-source") }),
  z.object({ kind: z.literal("frozen"), filter: z.string().min(1) }),
]);

const sourceEntrySchema = z.object({ sourceEntryId: databaseId, trackId: databaseId }).readonly();

const sourcePositionSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("entry"), sourceEntryId: databaseId }),
    z.object({ kind: z.literal("boundary"), index: z.number().int().nonnegative().safe() }),
  ])
  .nullable();

const queueItemSchema = z.object({
  queueItemId,
  trackId: databaseId,
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("manual") }),
    z.object({
      kind: z.literal("source"),
      sourceEntryId: databaseId,
      source: sourceIdentitySchema,
      sessionId: queueItemId,
    }),
  ]),
  anchor: z.object({ sourceEntryId: databaseId, side: z.enum(["before", "after"]) }).optional(),
});

const queuePlaybackSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stopped"), lastPlayed: queueItemSchema }),
  z.object({
    kind: z.literal("active"),
    current: queueItemSchema,
    status: z.enum(["playing", "paused"]),
    role: z.enum(["source-step", "standalone"]),
  }),
]);

const queueStateObjectSchema = z.object({
  sessionId: queueItemId,
  source: queueSourceSchema,
  tracking: sourceTrackingSchema,
  sort: trackSortSchema,
  sourceEntries: z.array(sourceEntrySchema).readonly(),
  sourcePosition: sourcePositionSchema,
  shuffleEnabled: z.boolean(),
  playback: queuePlaybackSchema,
  manualQueue: z.array(queueItemSchema),
  sourceQueue: z.array(queueItemSchema),
  previousSourceItems: z.array(queueItemSchema),
  suppressedSourceEntryIds: z.array(databaseId),
});

export const queueStateSchema = queueStateObjectSchema.superRefine((state, context) => {
  const reject = (message: string) => context.addIssue({ code: "custom", message });
  const entriesById = new Map(state.sourceEntries.map((entry) => [entry.sourceEntryId, entry]));
  const position = state.sourcePosition;

  if (entriesById.size !== state.sourceEntries.length) reject("Duplicate source entry");

  if (position?.kind === "entry" && !entriesById.has(position.sourceEntryId))
    reject("Source position names an unknown entry");

  if (position?.kind === "boundary" && position.index > state.sourceEntries.length)
    reject("Source boundary is past the end");

  const suppressed = state.suppressedSourceEntryIds;

  if (
    new Set(suppressed).size !== suppressed.length ||
    suppressed.some((id) => !entriesById.has(id))
  )
    reject("Suppressed entries must be unique and known");

  const listed = [...state.manualQueue, ...state.previousSourceItems, ...state.sourceQueue];
  const playback = state.playback;
  const occupied = playback.kind === "active" ? [...listed, playback.current] : listed;

  if (new Set(occupied.map((item) => item.queueItemId)).size !== occupied.length)
    reject("Duplicate queue item");

  for (const item of playback.kind === "stopped" ? [...occupied, playback.lastPlayed] : occupied) {
    if (item.anchor && !entriesById.has(item.anchor.sourceEntryId))
      reject("Anchor names an unknown entry");

    const origin = item.origin;

    if (origin.kind !== "source" || origin.sessionId !== state.sessionId) continue;

    if (!sameSource(state.source, origin.source)) reject("Item names another source");

    const entry = entriesById.get(origin.sourceEntryId);

    if (entry && entry.trackId !== item.trackId) reject("Item track differs from its entry");
  }

  if (playback.kind !== "stopped") return;

  const copy = listed.find((item) => item.queueItemId === playback.lastPlayed.queueItemId);

  if (
    copy &&
    (copy.trackId !== playback.lastPlayed.trackId || !sameOrigin(copy, playback.lastPlayed))
  )
    reject("Last played item differs from its queued copy");
});

function sameOrigin(left: QueueItem, right: QueueItem) {
  const [a, b] = [left.origin, right.origin];

  if (a.kind === "manual" || b.kind === "manual") return a.kind === b.kind;

  return (
    a.sourceEntryId === b.sourceEntryId &&
    a.sessionId === b.sessionId &&
    sameSource(a.source, b.source)
  );
}

export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;

export type QueueSource = z.infer<typeof queueSourceSchema>;

export type PlayableSource = Exclude<QueueSource, { kind: "deleted-playlist" }>;

export type SourceTracking = z.infer<typeof sourceTrackingSchema>;

export type SourcePosition = z.infer<typeof sourcePositionSchema>;

export type SourceEntry = z.infer<typeof sourceEntrySchema>;

export type QueueItem = z.infer<typeof queueItemSchema>;

export type QueuePlayback = z.infer<typeof queuePlaybackSchema>;

export type ActivePlayback = Extract<QueuePlayback, { kind: "active" }>;

export type CurrentRole = ActivePlayback["role"];

export type QueueState = z.infer<typeof queueStateSchema>;

export type QueueLane = "manual" | "source";
