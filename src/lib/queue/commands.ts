import type { QueueLane, SourceEntry, SourceIdentity, SourceRef } from "./model";

export type QueueRandom = {
  shuffle: (entries: readonly SourceEntry[]) => SourceEntry[];
  index: (count: number) => number;
};

export type QueueContext = {
  availableTrackIds: ReadonlySet<number>;
  random: QueueRandom;
};

export type SessionStart =
  | { kind: "entry"; sourceEntryId: number }
  | { kind: "first-available" }
  | { kind: "random" };

export type QueueCommand =
  | {
      type: "startSession";
      source: Exclude<SourceRef, { kind: "detached" }>;
      entries: readonly SourceEntry[];
      sessionId: string;
      start: SessionStart;
      shuffled: boolean;
      paused?: boolean;
    }
  | { type: "setShuffleEnabled"; enabled: boolean }
  | { type: "selectSourceEntry"; source: SourceIdentity; sourceEntryId: number }
  | { type: "enqueueTrack"; trackId: number; queueItemId: string }
  | { type: "jumpTo"; queueItemId: string }
  | {
      type: "moveQueueItem";
      queueItemId: string;
      to: QueueLane;
      beforeQueueItemId?: string;
    }
  | { type: "removeQueueItem"; queueItemId: string }
  | { type: "next" }
  | { type: "previous" }
  | { type: "playbackStarted" }
  | { type: "playbackPaused" }
  | {
      type: "sourceEntryAdded";
      playlistId: number;
      entry: SourceEntry;
      canonicalIndex?: number;
    }
  | { type: "sourceEntryRemoved"; playlistId: number; sourceEntryId: number }
  | {
      type: "sourceEntryMoved";
      playlistId: number;
      sourceEntryId: number;
      targetSourceEntryId: number;
      side: "before" | "after";
      orderedSourceEntryIds: readonly number[];
    }
  | { type: "sourceDeleted"; playlistId: number }
  | { type: "libraryRescanned"; entries: readonly SourceEntry[] };

export type SessionSource = Pick<
  Extract<QueueCommand, { type: "startSession" }>,
  "source" | "entries"
>;
