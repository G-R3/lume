import type { LibraryRevision, ScanFrame } from "../../shared/library";

export type ScanFrames = { shown: ScanFrame; waiting: readonly ScanFrame[] };

export function receiveScanFrame(
  frames: ScanFrames,
  frame: ScanFrame,
  libraryRevision: LibraryRevision,
): ScanFrames {
  const newest = frames.waiting.at(-1) ?? frames.shown;

  if (frame.sequence <= newest.sequence) return frames;

  return settleScanFrames({ ...frames, waiting: [...frames.waiting, frame] }, libraryRevision);
}

// Main numbers frames in commit order, so the frames a library revision covers come first.
export function settleScanFrames(frames: ScanFrames, libraryRevision: LibraryRevision): ScanFrames {
  const covered = frames.waiting.findLastIndex((frame) => frame.afterRevision <= libraryRevision);

  if (covered === -1) return frames;

  return { shown: frames.waiting[covered], waiting: frames.waiting.slice(covered + 1) };
}
