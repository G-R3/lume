import type { Track } from "../../shared/lib";
import type { PlaybackFailures } from "@/lib/playback-controller";
import type { FileCheck, PlaybackPhase, TrackFailure } from "@/lib/playback-phase";
import type { QueueState } from "@/lib/queue/model";
import { selectCurrentItem } from "@/lib/queue/selectors";

export type PlaybackNotice =
  | { kind: "track"; title: string | null; failure: TrackFailure }
  | { kind: "source-reload"; playlistTitle: string | null }
  | { kind: "restore" }
  | { kind: "save" };

function trackNotice(
  queue: QueueState | null,
  tracksById: ReadonlyMap<number, Pick<Track, "title">>,
  failures: PlaybackFailures,
  phase: PlaybackPhase,
): PlaybackNotice | null {
  const current = selectCurrentItem(queue);
  const title = (trackId: number) => tracksById.get(trackId)?.title ?? null;

  if (phase.kind === "failed" && current)
    return { kind: "track", title: title(current.trackId), failure: phase.reason };

  const skipped = failures.track;

  if (!skipped || skipped.queueItemId === current?.queueItemId) return null;

  return {
    kind: "track",
    title: title(skipped.trackId),
    failure:
      skipped.kind === "load" ? { kind: "load", file: skipped.file } : { kind: "unavailable" },
  };
}

export function derivePlaybackNotices({
  queue,
  tracksById,
  failures,
  phase,
}: {
  queue: QueueState | null;
  tracksById: ReadonlyMap<number, Pick<Track, "title">>;
  failures: PlaybackFailures;
  phase: PlaybackPhase;
}): readonly PlaybackNotice[] {
  const track = trackNotice(queue, tracksById, failures, phase);

  return [
    ...(track ? [track] : []),
    ...(failures.sourceReload
      ? [
          {
            kind: "source-reload",
            playlistTitle: queue?.source.kind === "playlist" ? queue.source.title : null,
          } as const,
        ]
      : []),
    ...(failures.restore ? [{ kind: "restore" } as const] : []),
    ...(failures.save ? [{ kind: "save" } as const] : []),
  ];
}

function loadFailureCopy(title: string, file: FileCheck) {
  switch (file) {
    case "checking":
      return `Could not play ${title}.`;
    case "missing":
      return `Could not play ${title}. Its file was moved, deleted, or disconnected.`;
    case "unreadable":
      return `Could not play ${title}. The file can’t be read or is in a format Lume can’t play.`;
  }
}

function trackFailureCopy(title: string, failure: TrackFailure) {
  switch (failure.kind) {
    case "load":
      return loadFailureCopy(title, failure.file);
    case "rejected":
      return `Could not play ${title}. Press Play to try again.`;
    case "unavailable":
      return `Could not play ${title}. It’s unavailable. Check its folder in Settings.`;
  }
}

export function formatPlaybackNotice(notice: PlaybackNotice): string {
  switch (notice.kind) {
    case "track":
      return trackFailureCopy(notice.title ?? "this track", notice.failure);
    case "source-reload":
      return `Could not reload ${notice.playlistTitle ?? "the playlist"}. Press Play to try again.`;
    case "restore":
      return "Could not restore your last queue.";
    case "save":
      return "Could not save playback. Your queue and position might not be there next time.";
  }
}
