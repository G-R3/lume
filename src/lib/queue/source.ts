import type { MusicLibrary } from "../../../shared/lib";
import type { SourceEntry, SourceIdentity } from "./model";

export function sameSource(left: SourceIdentity, right: SourceIdentity) {
  return (
    left.kind === right.kind &&
    (left.kind === "all-tracks" ||
      (right.kind === "playlist" && left.playlistId === right.playlistId))
  );
}

export function collectionSource(playlistId: number | undefined): SourceIdentity {
  return playlistId === undefined ? { kind: "all-tracks" } : { kind: "playlist", playlistId };
}

/** All Tracks lists each library track once, so each source entry ID is its track ID. */
export function libraryEntries(library: MusicLibrary): SourceEntry[] {
  return library.tracks.map((track) => ({ sourceEntryId: track.id, trackId: track.id }));
}
