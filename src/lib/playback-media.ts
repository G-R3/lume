/** One item to load. Its ID lets the controller ignore late events from a previous item. */
export type PlaybackRequest = {
  queueItemId: string;
  url: string;
  shouldPlay: boolean;
  position: number;
  durationHint: number;
};

/** Playback events include the ID of the item that produced them. */
export type AudioEvent =
  | { type: "started"; queueItemId: string }
  | { type: "paused"; queueItemId: string }
  | { type: "ended"; queueItemId: string }
  | { type: "error"; queueItemId: string; message: string; source: "play" | "media" };
