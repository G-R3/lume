import { z } from "zod";

const databaseId = z.number().int().positive().safe();

const queueItemId = z.string().min(1);

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: databaseId, title: z.string() }),
  z.object({ kind: z.literal("detached"), title: z.string() }),
]);

const sourceIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-tracks") }),
  z.object({ kind: z.literal("playlist"), playlistId: databaseId }),
]);

const sourceEntrySchema = z.object({ sourceEntryId: databaseId, trackId: databaseId });

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

export const queueStateSchema = z.object({
  source: sourceSchema,
  sessionId: queueItemId,
  sourceEntries: z.array(sourceEntrySchema),
  sourceIdentity: sourceIdentitySchema,
  sourcePosition: sourcePositionSchema,
  shuffleEnabled: z.boolean(),
  current: z
    .object({
      item: queueItemSchema,
      lane: z.enum(["manual", "source"]),
      hasStartedPlayback: z.boolean(),
      // This value controls whether Previous can return to the current queue item.
      // Previous can include queue-only items without changing sourcePosition.
      participatesInSourceNavigation: z.boolean(),
    })
    .nullable(),
  manualQueue: z.array(queueItemSchema),
  sourceQueue: z.array(queueItemSchema),
  // Previous can return to these queue items, including items that did not start playback.
  previousSourceItems: z.array(queueItemSchema),
  suppressedSourceEntryIds: z.array(databaseId),
  // These queueItemId values identify items that started playback. Each ID appears once.
  playedQueueItemIds: z.array(queueItemId),
  status: z.enum(["playing", "paused", "stopped"]),
  lastSelectedItem: queueItemSchema.nullable(),
});

export type SourceRef = z.infer<typeof sourceSchema>;

export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;

export type SourcePosition = z.infer<typeof sourcePositionSchema>;

export type SourceEntry = z.infer<typeof sourceEntrySchema>;

export type QueueItem = z.infer<typeof queueItemSchema>;

export type QueueState = z.infer<typeof queueStateSchema>;

export type QueueLane = "manual" | "source";
