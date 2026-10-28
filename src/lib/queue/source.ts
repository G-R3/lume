import type { MusicLibrary } from "../../../shared/lib";
import { getTrackSort, sortTracks } from "../track-sort";
import type { PlayableSource, SessionSource } from "./commands";
import type { SourceEntry, SourceIdentity } from "./model";

export function sameSource(left: SourceIdentity, right: SourceIdentity) {
  return (
    left.kind === right.kind &&
    (left.kind === "all-tracks" ||
      (right.kind === "playlist" && left.playlistId === right.playlistId))
  );
}

export function sessionSource(
  source: PlayableSource,
  rows: readonly { sourceEntryId: number; track: { id: number } }[],
  filter: string | null,
): SessionSource {
  return {
    source,
    entries: rows.map((row) => ({ sourceEntryId: row.sourceEntryId, trackId: row.track.id })),
    filter,
  };
}

export function libraryEntries(library: MusicLibrary): SourceEntry[] {
  return sortTracks(library.tracks, getTrackSort()).map((track) => ({
    sourceEntryId: track.id,
    trackId: track.id,
  }));
}
