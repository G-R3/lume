import { eq } from "drizzle-orm";
import type { SavedPlaybackSession } from "../shared/lib";
import { getDatabase, runImmediateTransaction } from "./database";
import { playbackPosition, playbackSession } from "./database/schema";

export function loadPlaybackSession(): SavedPlaybackSession | null {
  return (
    getDatabase()
      .select({ payload: playbackSession.payload, position: playbackPosition.position })
      .from(playbackSession)
      .innerJoin(playbackPosition, eq(playbackPosition.id, playbackSession.id))
      .where(eq(playbackSession.id, 1))
      .get() ?? null
  );
}

export function savePlaybackSession({ payload, position }: SavedPlaybackSession) {
  runImmediateTransaction(getDatabase(), (transaction) => {
    transaction
      .insert(playbackSession)
      .values({ id: 1, payload })
      .onConflictDoUpdate({ target: playbackSession.id, set: { payload } })
      .run();
    transaction
      .insert(playbackPosition)
      .values({ id: 1, position })
      .onConflictDoUpdate({ target: playbackPosition.id, set: { position } })
      .run();
  });
}

/** Update the position of the saved session. Does nothing before a session is saved. */
export function savePlaybackPosition(position: number) {
  getDatabase().update(playbackPosition).set({ position }).where(eq(playbackPosition.id, 1)).run();
}
