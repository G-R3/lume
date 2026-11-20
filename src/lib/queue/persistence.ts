import type { MusicLibrary } from "@shared/library";
import type { SavedPlaybackSession } from "@shared/ipc";
import { playbackPositionSchema } from "@shared/schemas";
import { queueStateSchema, type QueueState } from "./model";

export function serializeQueueSession(state: QueueState) {
  return JSON.stringify(state);
}

export function parseQueueSession(saved: SavedPlaybackSession | null, library: MusicLibrary) {
  if (!saved) return null;

  const position = playbackPositionSchema.parse(saved.position);
  const state = queueStateSchema.parse(JSON.parse(saved.payload));
  const { source, playback } = state;

  const deleted =
    source.kind === "playlist" &&
    !library.playlists.some((playlist) => playlist.id === source.playlistId);

  return {
    state: {
      ...state,
      source: deleted ? { ...source, kind: "deleted-playlist" as const } : source,
      playback: playback.kind === "active" ? { ...playback, status: "paused" as const } : playback,
    },
    position,
  };
}
