import type { TrackSort } from "../track-sort";
import type { PlayableSource, QueueLane, SourceEntry, SourceIdentity } from "./model";

export type QueueRandom = {
  shuffle: (entries: readonly SourceEntry[]) => SourceEntry[];
  index: (count: number) => number;
};

export type QueueContext = {
  availableTrackIds: ReadonlySet<number>;
  random: QueueRandom;
};

export type QueuePosition = "start" | "end";

export type SessionStart =
  | { kind: "entry"; sourceEntryId: number }
  | { kind: "first-available" }
  | { kind: "random" };

export type QueueCommand =
  | {
      type: "startSession";
      source: PlayableSource;
      entries: readonly SourceEntry[];
      filter: string | null;
      sort: TrackSort;
      sessionId: string;
      start: SessionStart;
      shuffled: boolean;
      paused?: boolean;
    }
  | { type: "setShuffleEnabled"; enabled: boolean }
  | {
      type: "selectSourceEntry";
      source: SourceIdentity;
      filter: string | null;
      sourceEntryId: number;
    }
  | {
      type: "enqueueTracks";
      items: readonly { trackId: number; queueItemId: string }[];
      position: QueuePosition;
    }
  | { type: "jumpTo"; queueItemId: string }
  | {
      type: "moveQueueItem";
      queueItemId: string;
      to: QueueLane;
      beforeQueueItemId?: string;
    }
  | { type: "removeQueueItem"; queueItemId: string }
  | { type: "clearManualQueue" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "playbackStarted" }
  | { type: "playbackPaused" }
  | { type: "sourceEntriesAdded"; playlistId: number; entries: readonly SourceEntry[] }
  | { type: "sourceEntriesRemoved"; playlistId: number; sourceEntryIds: readonly number[] }
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
  "source" | "entries" | "filter" | "sort"
>;
