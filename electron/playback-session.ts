import { eq } from "drizzle-orm";
import { getDatabase } from "./database";
import { playbackSession } from "./database/schema";

export function loadPlaybackSession() {
  return (
    getDatabase()
      .select({ payload: playbackSession.payload })
      .from(playbackSession)
      .where(eq(playbackSession.id, 1))
      .get()?.payload ?? null
  );
}

export function savePlaybackSession(payload: string) {
  getDatabase()
    .insert(playbackSession)
    .values({ id: 1, payload })
    .onConflictDoUpdate({ target: playbackSession.id, set: { payload } })
    .run();
}
