import { z } from "zod";

export const databaseId = z.number().int().positive().safe();

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

export const queueItemSchema = z.object({
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
      // When true, going forward adds the current track to `previousSourceItems`.
      // Going back puts the current track back in `sourceQueue` so it can be played again.
      // Removing the track from its playlist, or removing a queued copy of it, sets this to false
      // and the audio keeps playing if its currently playing.
      // Tracks played from the manual queue are always false.
      participatesInSourceNavigation: z.boolean(),
    })
    .nullable(),
  manualQueue: z.array(queueItemSchema),
  sourceQueue: z.array(queueItemSchema),

  // Tracks that were played, skipped, or came before the first selected track.
  // A shuffled session starts with this list empty.
  // The `previous` command uses this list to go back to an earlier track.
  // Unavailable tracks stay in the list but are skipped.
  // Removing a track from its playlist or from the queue also removes it from this list.
  previousSourceItems: z.array(queueItemSchema),
  suppressedSourceEntryIds: z.array(databaseId),
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
