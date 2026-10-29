import type { MusicLibrary } from "../../../shared/lib";
import { libraryRows, sortRows } from "../track-sort";
import { getViewSort } from "../view-sort";
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
  const allTracks = { kind: "all-tracks" } as const;

  return sortRows(allTracks, libraryRows(library.tracks), getViewSort(allTracks)).map((row) => ({
    sourceEntryId: row.sourceEntryId,
    trackId: row.track.id,
  }));
}
