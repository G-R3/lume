import { eq } from "drizzle-orm";
import type { SavedPlaybackSession } from "@shared/ipc";
import { getDatabase } from "./database";
import { PlaybackSessionTable } from "./database/schema";

export function loadPlaybackSession(): SavedPlaybackSession | null {
  return (
    getDatabase()
      .select({ payload: PlaybackSessionTable.payload, position: PlaybackSessionTable.position })
      .from(PlaybackSessionTable)
      .get() ?? null
  );
}

export function savePlaybackSession({ payload, position }: SavedPlaybackSession) {
  getDatabase()
    .insert(PlaybackSessionTable)
    .values({ id: 1, payload, position })
    .onConflictDoUpdate({ target: PlaybackSessionTable.id, set: { payload, position } })
    .run();
}

export function savePlaybackPosition(position: number) {
  getDatabase()
    .update(PlaybackSessionTable)
    .set({ position })
    .where(eq(PlaybackSessionTable.id, 1))
    .run();
}
