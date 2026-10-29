import type { MusicLibrary, PlaylistDetails, Track } from "../../../shared/lib";
import { libraryRows, playlistRows, sortRows, type TrackSort } from "../track-sort";
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
  sort: TrackSort,
): SessionSource {
  return { source, entries: rows.map(toEntry), filter, sort };
}

export function libraryEntries(library: MusicLibrary, sort: TrackSort): SourceEntry[] {
  return sortRows({ kind: "all-tracks" }, libraryRows(library.tracks), sort).map(toEntry);
}

export function playlistEntries(
  playlist: PlaylistDetails,
  tracksById: ReadonlyMap<number, Track>,
  sort: TrackSort,
): SourceEntry[] {
  const view = { kind: "playlist", playlistId: playlist.id } as const;

  return sortRows(view, playlistRows(playlist, tracksById), sort).map(toEntry);
}

function toEntry(row: { sourceEntryId: number; track: { id: number } }): SourceEntry {
  return { sourceEntryId: row.sourceEntryId, trackId: row.track.id };
}
