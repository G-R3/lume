import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { parseQueueSession, serializeQueueSession, transition } from "../src/lib/queue";
import { closeDatabase, initializeDatabase } from "./database";
import { loadPlaybackSession, savePlaybackSession } from "./playback-session";

it("restores a saved queue paused at its position after its playlist is deleted", async () => {
  const folder = await mkdtemp(join(tmpdir(), "lume-queue-session-"));
  const databasePath = join(folder, "library.sqlite");

  try {
    await initializeDatabase({
      location: databasePath,
      migrationsFolder: join(import.meta.dirname, "../drizzle"),
    });

    const available = new Set([1, 2, 3]);

    const started = transition(
      null,
      {
        type: "startFromSource",
        source: { kind: "playlist", playlistId: 1, title: "Deleted playlist" },
        occurrences: [1, 2, 3].map((trackId) => ({ occurrenceId: trackId, trackId })),
        atOccurrenceId: 1,
        sessionId: "session",
      },
      available,
    );

    const withManual = transition(
      started,
      { type: "addNext", trackId: 3, queueItemId: "manual" },
      available,
    );

    if (!withManual) throw new Error("Expected a queue session");

    savePlaybackSession(serializeQueueSession(withManual, 7.25));
    closeDatabase();

    await initializeDatabase({
      location: databasePath,
      migrationsFolder: join(import.meta.dirname, "../drizzle"),
    });

    const restored = parseQueueSession(loadPlaybackSession(), {
      kind: "library",
      playlists: [],
      sources: [],
      tracks: [],
    });

    expect(restored?.position).toBe(7.25);
    expect(restored?.state.status).toBe("paused");
    expect(restored?.state.source).toEqual({ kind: "detached", title: "Deleted playlist" });
    expect(restored?.state.current?.item.trackId).toBe(1);
    expect(restored?.state.manualQueue.map((item) => item.trackId)).toEqual([3]);
    expect(restored?.state.sourceQueue.map((item) => item.trackId)).toEqual([2, 3]);
  } finally {
    closeDatabase();
    await rm(folder, { force: true, recursive: true });
  }
});
