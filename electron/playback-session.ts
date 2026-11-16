import { eq } from "drizzle-orm";
import type { SavedPlaybackSession } from "../shared/lib";
import { getDatabase } from "./database";
import { playbackSession } from "./database/schema";

export function loadPlaybackSession(): SavedPlaybackSession | null {
  return (
    getDatabase()
      .select({ payload: playbackSession.payload, position: playbackSession.position })
      .from(playbackSession)
      .get() ?? null
  );
}

export function savePlaybackSession({ payload, position }: SavedPlaybackSession) {
  getDatabase()
    .insert(playbackSession)
    .values({ id: 1, payload, position })
    .onConflictDoUpdate({ target: playbackSession.id, set: { payload, position } })
    .run();
}

export function savePlaybackPosition(position: number) {
  getDatabase().update(playbackSession).set({ position }).where(eq(playbackSession.id, 1)).run();
}
