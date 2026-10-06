import type { QueueLane, SourceEntry, SourceIdentity, SourceRef } from "./model";

/** Random choices for queue transitions. The controller supplies them, so transitions stay deterministic. */
export type QueueRandom = {
  shuffle: (entries: readonly SourceEntry[]) => SourceEntry[];
  /** Returns a random integer from zero up to, but not including, count. */
  index: (count: number) => number;
};

export type QueueContext = {
  availableTrackIds: ReadonlySet<number>;
  random: QueueRandom;
};

/** Which entry a new session plays first. */
export type SessionStart =
  /** This source entry. The session does not start if its track is unavailable. */
  | { kind: "entry"; sourceEntryId: number }
  /** The first available entry in source order, also when the session is shuffled. */
  | { kind: "first-available" }
  /** The first available entry in the shuffled order. */
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
      // Position in the saved playlist. Without it, the entry is added at the end.
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
