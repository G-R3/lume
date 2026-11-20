import type { MediaView } from "@/lib/media-lifecycle";
import type { QueueState } from "@/lib/queue/model";
import { selectCurrentItem, selectPlaybackIntent } from "@/lib/queue/selectors";

export type FileCheck = "checking" | "missing" | "unreadable";

export type TrackFailure =
  | { kind: "load"; file: FileCheck }
  | { kind: "rejected" }
  | { kind: "unavailable" };

export type FailedTrack =
  | { kind: "load"; trackId: number; queueItemId: string; requestId: string; file: FileCheck }
  | { kind: "unavailable"; trackId: number; queueItemId: string };

export type PlaybackPhase =
  | { kind: "stopped" }
  | { kind: "loading" }
  | { kind: "playing" }
  | { kind: "paused" }
  | { kind: "failed"; reason: TrackFailure };

export function derivePlaybackPhase(
  queue: QueueState | null,
  media: MediaView,
  availableTrackIds: ReadonlySet<number>,
  failedTrack: FailedTrack | null,
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
        return {
          kind: "failed",
          reason:
            media.playback.reason === "rejected"
              ? { kind: "rejected" }
              : {
                  kind: "load",
                  file:
                    failedTrack?.kind === "load" &&
                    failedTrack.requestId === media.request.requestId
                      ? failedTrack.file
                      : "checking",
                },
        };
    }
  }

  if (!availableTrackIds.has(current.trackId))
    return { kind: "failed", reason: { kind: "unavailable" } };

  return selectPlaybackIntent(queue) === "playing" ? { kind: "loading" } : { kind: "paused" };
}

export function pausesOnToggle(phase: PlaybackPhase) {
  return phase.kind === "loading" || phase.kind === "playing";
}
