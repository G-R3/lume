import { z } from "zod";
import type { MusicLibrary, SavedPlaybackSession } from "../../../shared/lib";
import { queueStateSchema, type QueueState } from "./model";

const positionSchema = z.number().finite().nonnegative();

export function serializeQueueSession(state: QueueState) {
  return JSON.stringify(state);
}

export function parseQueueSession(saved: SavedPlaybackSession | null, library: MusicLibrary) {
  if (!saved || !positionSchema.safeParse(saved.position).success) return null;

  try {
    const parsed = queueStateSchema.safeParse(JSON.parse(saved.payload));

    if (!parsed.success) return null;

    const { source, playback } = parsed.data;

    const deleted =
      source.kind === "playlist" &&
      !library.playlists.some((playlist) => playlist.id === source.playlistId);

    return {
      state: {
        ...parsed.data,
        source: deleted ? { ...source, kind: "deleted-playlist" as const } : source,
        playback:
          playback.kind === "active" ? { ...playback, status: "paused" as const } : playback,
      },
      position: saved.position,
    };
  } catch {
    return null;
  }
}
