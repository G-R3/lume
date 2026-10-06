import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { parseQueueSession, serializeQueueSession, transition } from "../src/lib/queue";
import { openTestDatabase } from "./helpers/database";
import { createTemporaryFolder } from "./helpers/temp-folder";
import { closeDatabase } from "../electron/database";
import {
  loadPlaybackSession,
  savePlaybackPosition,
  savePlaybackSession,
} from "../electron/playback-session";

it("restores a saved queue paused at its position after its playlist is deleted", async () => {
  const folder = await createTemporaryFolder("lume-queue-session-");
  const databasePath = join(folder, "library.sqlite");

  await openTestDatabase(databasePath);

  const available = new Set([1, 2, 3]);

  const started = transition(
    null,
    {
      type: "startFromSource",
      source: { kind: "playlist", playlistId: 1, title: "Deleted playlist" },
      entries: [1, 2, 3].map((trackId) => ({ sourceEntryId: trackId, trackId })),
      startEntryId: 1,
      sessionId: "session",
    },
    available,
  );

  const withManual = transition(
    started,
    { type: "enqueueTrack", trackId: 3, queueItemId: "manual" },
    available,
  );

  if (!withManual) throw new Error("Expected a queue session");

  savePlaybackSession({ payload: serializeQueueSession(withManual), position: 7.25 });
  closeDatabase();

  await openTestDatabase(databasePath);

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
});

it("updates only the saved position and keeps it across a restart", async () => {
  const folder = await createTemporaryFolder("lume-queue-position-");
  const databasePath = join(folder, "library.sqlite");

  await openTestDatabase(databasePath);
  savePlaybackPosition(3);
  expect(loadPlaybackSession()).toBe(null);

  savePlaybackSession({ payload: "queue", position: 7.25 });
  savePlaybackPosition(19.5);
  closeDatabase();

  await openTestDatabase(databasePath);
  expect(loadPlaybackSession()).toEqual({ payload: "queue", position: 19.5 });

  savePlaybackSession({ payload: "changed queue", position: 0 });
  expect(loadPlaybackSession()).toEqual({ payload: "changed queue", position: 0 });
});
