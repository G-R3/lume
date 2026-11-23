import { z } from "zod";
import { DatabaseIdSchema } from "@shared/schemas";
import { TrackSortSchema } from "../track-sort";
import { allQueueItems, listedItems } from "./items";
import { sameSource } from "./source";

const QueueItemIdSchema = z.string().min(1);

const SourceIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: DatabaseIdSchema }),
]);

const QueueSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: DatabaseIdSchema, title: z.string() }),
  z.object({
    kind: z.literal("deleted-playlist"),
    playlistId: DatabaseIdSchema,
    title: z.string(),
  }),
]);

const SourceTrackingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("follows-source") }),
  z.object({ kind: z.literal("frozen"), filter: z.string().min(1) }),
]);

const SourceEntrySchema = z
  .object({ sourceEntryId: DatabaseIdSchema, trackId: DatabaseIdSchema })
  .readonly();

const SourcePositionSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("entry"), sourceEntryId: DatabaseIdSchema }),
    z.object({ kind: z.literal("boundary"), index: z.number().int().nonnegative().safe() }),
  ])
  .nullable();

const QueueItemSchema = z.object({
  queueItemId: QueueItemIdSchema,
  trackId: DatabaseIdSchema,
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("manual") }),
    z.object({
      kind: z.literal("source"),
      sourceEntryId: DatabaseIdSchema,
      source: SourceIdentitySchema,
      sessionId: QueueItemIdSchema,
    }),
  ]),
  anchor: z
    .object({ sourceEntryId: DatabaseIdSchema, side: z.enum(["before", "after"]) })
    .optional(),
});

const QueuePlaybackSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stopped"), lastPlayed: QueueItemSchema }),
  z.object({
    kind: z.literal("active"),
    current: QueueItemSchema,
    status: z.enum(["playing", "paused"]),
    role: z.enum(["source-step", "standalone"]),
  }),
]);

const QueueStateObjectSchema = z.object({
  sessionId: QueueItemIdSchema,
  source: QueueSourceSchema,
  tracking: SourceTrackingSchema,
  sort: TrackSortSchema,
  sourceEntries: z.array(SourceEntrySchema).readonly(),
  sourcePosition: SourcePositionSchema,
  shuffleEnabled: z.boolean(),
  playback: QueuePlaybackSchema,
  manualQueue: z.array(QueueItemSchema),
  sourceQueue: z.array(QueueItemSchema),
  previousSourceItems: z.array(QueueItemSchema),
  suppressedSourceEntryIds: z.array(DatabaseIdSchema),
});

export const QueueStateSchema = QueueStateObjectSchema.superRefine((state, context) => {
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

  const listed = listedItems(state);
  const playback = state.playback;
  const occupied = playback.kind === "active" ? allQueueItems(state) : listed;

  if (new Set(occupied.map((item) => item.queueItemId)).size !== occupied.length)
    reject("Duplicate queue item");

  for (const item of allQueueItems(state)) {
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

export type SourceIdentity = z.infer<typeof SourceIdentitySchema>;

export type QueueSource = z.infer<typeof QueueSourceSchema>;

export type PlayableSource = Exclude<QueueSource, { kind: "deleted-playlist" }>;

export type SourceTracking = z.infer<typeof SourceTrackingSchema>;

export type SourcePosition = z.infer<typeof SourcePositionSchema>;

export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export type QueueItem = z.infer<typeof QueueItemSchema>;

export type QueuePlayback = z.infer<typeof QueuePlaybackSchema>;

export type ActivePlayback = Extract<QueuePlayback, { kind: "active" }>;

export type CurrentRole = ActivePlayback["role"];

export type QueueState = z.infer<typeof QueueStateSchema>;

export type QueueLane = "manual" | "source";
