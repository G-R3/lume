export type PlaybackRequest = {
  requestId: string;
  queueItemId: string;
  trackId: number;
  url: string;
  shouldPlay: boolean;
  position: number;
  durationHint: number;
};

// Why a track did not play: its file is gone, the file cannot be decoded, or play() was refused.
export type PlaybackFailure = "unavailable" | "unplayable" | "rejected";

export type AudioEvent =
  | { type: "started"; requestId: string; queueItemId: string }
  | { type: "paused"; requestId: string; queueItemId: string }
  | { type: "ended"; requestId: string; queueItemId: string }
  | { type: "error"; requestId: string; queueItemId: string; reason: PlaybackFailure };
