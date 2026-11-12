import type { MediaView } from "@/lib/media-lifecycle";
import type { QueueState } from "@/lib/queue/model";
import { selectCurrentItem, selectPlaybackStatus } from "@/lib/queue/selectors";

export type PlaybackFailure = "load" | "rejected" | "unavailable";

export type PlaybackPhase =
  | { kind: "stopped" }
  | { kind: "loading" }
  | { kind: "playing" }
  | { kind: "paused" }
  | { kind: "failed"; reason: PlaybackFailure };

export function derivePlaybackPhase(
  queue: QueueState | null,
  media: MediaView,
  availableTrackIds: ReadonlySet<number>,
): PlaybackPhase {
  const current = selectCurrentItem(queue);

  if (!current) return { kind: "stopped" };

  if (media.kind === "requested" && media.request.queueItemId === current.queueItemId) {
    switch (media.playback.kind) {
      case "paused":
        return { kind: "paused" };
      case "starting":
        return { kind: "loading" };
      case "playing":
        return { kind: "playing" };
      case "failed":
        return { kind: "failed", reason: media.playback.reason };
    }
  }

  if (!availableTrackIds.has(current.trackId)) return { kind: "failed", reason: "unavailable" };

  return selectPlaybackStatus(queue) === "playing" ? { kind: "loading" } : { kind: "paused" };
}

export function pausesOnToggle(phase: PlaybackPhase) {
  return phase.kind === "loading" || phase.kind === "playing";
}
