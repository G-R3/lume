import type { MusicLibrary, PlaylistDetails, Track } from "../../../shared/lib";
import { libraryRows, playlistRows, sortRows, type TrackSort } from "../track-sort";
import type { SessionSource } from "./commands";
import type { PlayableSource, QueueSource, SourceEntry, SourceIdentity } from "./model";

export function sameSource(source: QueueSource | SourceIdentity, identity: SourceIdentity) {
  return source.kind === "all-tracks"
    ? identity.kind === "all-tracks"
    : identity.kind === "playlist" && source.playlistId === identity.playlistId;
}

export function sourceIdentity(source: QueueSource): SourceIdentity {
  return source.kind === "all-tracks"
    ? { kind: "all-tracks" }
    : { kind: "playlist", playlistId: source.playlistId };
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
