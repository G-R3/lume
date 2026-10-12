import type { MusicLibrary } from "../../../shared/lib";
import { getTrackSort, sortTracks } from "../track-sort";
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

/**
 * All Tracks lists each library track once, so each source entry ID is its track ID. Entries follow
 * the Tracks view's sort, so playback continues down the rows the user sees.
 */
export function libraryEntries(library: MusicLibrary): SourceEntry[] {
  return sortTracks(library.tracks, getTrackSort()).map((track) => ({
    sourceEntryId: track.id,
    trackId: track.id,
  }));
}
