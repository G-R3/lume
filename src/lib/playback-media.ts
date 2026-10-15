export type PlaybackRequest = {
  requestId: string;
  queueItemId: string;
  url: string;
  shouldPlay: boolean;
  position: number;
  durationHint: number;
};

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
