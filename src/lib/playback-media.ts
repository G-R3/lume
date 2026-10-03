/** One item to load. Its request ID lets the controller ignore late events from a previous load. */
export type PlaybackRequest = {
  requestId: string;
  queueItemId: string;
  url: string;
  shouldPlay: boolean;
  position: number;
  durationHint: number;
};

/** Playback events include the request ID and the ID of the item that produced them. */
export type AudioEvent =
  | { type: "started"; requestId: string; queueItemId: string }
  | { type: "paused"; requestId: string; queueItemId: string }
  | { type: "ended"; requestId: string; queueItemId: string }
  | {
      type: "error";
      requestId: string;
      queueItemId: string;
      message: string;
      source: "play" | "media";
    };
