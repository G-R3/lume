import { expect, it } from "vite-plus/test";
import type {
  LumeApi,
  MusicLibrary,
  PlaylistDetails,
  SavedPlaybackSession,
  Track,
} from "../../shared/lib";
import { createPlaybackController } from "./playback-controller";
import type { PlaybackRequest } from "./playback-media";
import type { SessionSource } from "./queue/commands";
import { parseQueueSession } from "./queue/persistence";
import { libraryEntries, playlistEntries } from "./queue/source";
import { defaultSort, trackSort } from "./track-sort";
import { stepViewSort } from "./view-sort";

it.each([
  { manualPlaying: false, paused: false },
  { manualPlaying: false, paused: true },
  { manualPlaying: true, paused: false },
  { manualPlaying: true, paused: true },
])(
  "clears all pending manual tracks without interrupting playback, manualPlaying=$manualPlaying, paused=$paused",
  async ({ manualPlaying, paused }) => {
    const playback = createTestPlayback();

    const library = {
      kind: "library",
      playlists: [],
      sources: [],
      tracks: [track(1), track(2), { ...track(3), available: false }],
    } satisfies MusicLibrary;

    playback.controller.syncLibrary(library);
    await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

    playback.controller.playSourceEntry(allTracks(playback.controller), 1);

    if (manualPlaying) {
      playback.controller.enqueueTracks([2], "end");
      playback.controller.next();
    }

    // Include duplicates, unavailable tracks, and more than the panel's 50 visible rows.
    Array.from({ length: 60 }, (_, index) => (index % 2 === 0 ? 2 : 3)).forEach((trackId) => {
      playback.controller.enqueueTracks([trackId], "end");
    });
    playback.controller.seek(19);

    if (paused) playback.controller.pause();

    const queue = playback.controller.getSnapshot().queue;
    const request = playback.audioState.request;
    expect(queue?.manualQueue).toHaveLength(60);

    playback.controller.clearManualQueue();

    expect(playback.controller.getSnapshot().queue).toEqual({ ...queue, manualQueue: [] });
    expect(playback.audioState).toEqual({ request, position: 19, playing: !paused });
    await expect
      .poll(() => parseQueueSession(playback.stored(), library))
      .toMatchObject({
        state: { manualQueue: [] },
        position: 19,
      });

    const cleared = playback.controller.getSnapshot().queue;
    playback.controller.clearManualQueue();
    expect(playback.controller.getSnapshot().queue).toBe(cleared);

    playback.controller.next();
    expect(playback.controller.getSnapshot().queue?.current).toMatchObject({
      item: { trackId: 2 },
      lane: "source",
    });
  },
);

it.each([
  { source: "all-tracks", shuffled: false, expectedTracks: [3, 4] },
  { source: "playlist", shuffled: false, expectedTracks: [3] },
  { source: "all-tracks", shuffled: true, expectedTracks: [3, 1, 4] },
  { source: "playlist", shuffled: true, expectedTracks: [3, 1] },
] as const)(
  "resets an exhausted $source source paused after the manual queue finishes, shuffle=$shuffled",
  async ({ source, shuffled, expectedTracks }) => {
    const tracks = [{ ...track(1), available: false }, track(2), track(3), track(4)];

    const playlist = {
      id: 1,
      title: "Source",
      description: null,
      tracks: tracks.slice(0, 3).map((item, position) => ({
        id: item.id + 10,
        trackId: item.id,
        position,
        addedAt: position,
      })),
    } satisfies PlaylistDetails;

    const playback = await createReadyPlayback(
      { kind: "library", sources: [], playlists: [], tracks },
      { loadPlaylist: () => Promise.resolve(playlist) },
    );

    playback.controller.playSourceEntry(
      source === "playlist" ? playlistView(playlist) : allTracks(playback.controller),
      source === "playlist" ? 13 : 4,
    );

    if (shuffled) {
      playback.controller.setShuffleEnabled(true);
      playback.controller.getSnapshot().queue?.sourceQueue.forEach((item) => {
        playback.controller.removeQueueItem(item.queueItemId);
      });
    }

    playback.controller.enqueueTracks([4], "end");

    expect(
      playback.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId),
    ).toEqual([4]);

    const lastSourceItem = playback.requests.at(-1);

    if (!lastSourceItem) throw new Error("Expected the source track to load");
    playback.controller.handleAudioEvent({
      type: "ended",
      requestId: lastSourceItem.requestId,
      queueItemId: lastSourceItem.queueItemId,
    });

    expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(4);
    expect(playback.requests.at(-1)?.shouldPlay).toBe(true);

    const manualItem = playback.requests.at(-1);

    if (!manualItem) throw new Error("Expected the manual track to load");
    playback.controller.handleAudioEvent({
      type: "ended",
      requestId: manualItem.requestId,
      queueItemId: manualItem.queueItemId,
    });

    await expect.poll(() => playback.controller.getSnapshot().queue?.status).toBe("paused");

    expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(2);
    expect(playback.controller.getSnapshot().queue?.manualQueue).toEqual([]);
    expect(playback.controller.getSnapshot().queue?.shuffleEnabled).toBe(shuffled);

    expect(
      playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId),
    ).toEqual(expectedTracks);

    expect(playback.requests.at(-1)).toMatchObject({ position: 0, shouldPlay: false });
  },
);

it("stays stopped when the source no longer has any available tracks", async () => {
  const playback = await createReadyPlayback({
    kind: "library",
    sources: [],
    playlists: [],
    tracks: [track(1)],
  });

  playback.controller.playSourceEntry(allTracks(playback.controller), 1);

  expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/1", shouldPlay: true });

  playback.controller.syncLibrary({
    kind: "library",
    sources: [],
    playlists: [],
    tracks: [{ ...track(1), available: false }],
  });

  playback.controller.next();

  expect(playback.controller.getSnapshot().queue?.status).toBe("stopped");
  expect(playback.requests.at(-1)).toBeNull();
});

it("keeps the active source in order through playlist edits", async () => {
  const playlist = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [1, 2, 3].map((trackId, position) => ({
      id: trackId,
      trackId,
      position,
      addedAt: position,
    })),
  } satisfies PlaylistDetails;

  const controller = createTestPlayback({
    loadPlaylist: () => Promise.resolve(playlist),
  }).controller;

  const library = {
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
    sources: [],
    tracks: [track(1), track(2), track(3), track(4)],
  } satisfies MusicLibrary;

  controller.syncLibrary(library);
  await expect.poll(() => controller.getSnapshot().isInitialized).toBe(true);
  controller.playSourceEntry(playlistView(playlist), 1);

  controller.applySourceChange({
    type: "sourceEntriesRemoved",
    playlistId: 1,
    sourceEntryIds: [2],
  });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  controller.applySourceChange({
    type: "sourceEntriesAdded",
    playlistId: 1,
    entries: [{ sourceEntryId: 4, trackId: 4 }],
  });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);

  controller.applySourceChange({ type: "sourceDeleted", playlistId: 1 });

  expect(controller.getSnapshot().queue?.source).toEqual({ kind: "detached", title: "Source" });
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(1);
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);
});

it("restarts the current track before navigating to the prior source item", async () => {
  const playback = createTestPlayback();
  const controller = playback.controller;

  const tracks = [track(1), track(2), track(3)];
  controller.syncLibrary({ kind: "library", playlists: [], sources: [], tracks });
  await expect.poll(() => controller.getSnapshot().isInitialized).toBe(true);
  controller.playSourceEntry(allTracks(controller), 2);

  playback.media.seek(3);
  controller.previous();
  expect(playback.seeks).toEqual([3, 0]);
  expect(playback.media.getPosition()).toBe(0);
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(2);

  controller.previous();
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(1);
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3]);
});

it.each([false, true])(
  "preserves audio at 19 seconds when toggling shuffle, paused=%s",
  async (paused) => {
    let allowRandom = true;

    const playback = createTestPlayback({
      random: () => {
        if (!allowRandom) throw new Error("An unchanged shuffle setting must not draw randomness");

        return 0.37;
      },
    });

    const library = {
      kind: "library",
      playlists: [],
      sources: [],
      tracks: [1, 2, 3, 4].map(track),
    } satisfies MusicLibrary;

    playback.controller.syncLibrary(library);
    await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
    playback.controller.playSourceEntry(allTracks(playback.controller), 2);
    playback.controller.seek(19);

    if (paused) playback.controller.pause();
    const request = playback.audioState.request;

    playback.controller.setShuffleEnabled(true);
    expect(playback.controller.getSnapshot().queue).toMatchObject({
      shuffleEnabled: true,
      status: paused ? "paused" : "playing",
      current: { item: { trackId: 2 } },
    });
    expect(
      playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId),
    ).toEqual([4, 1, 3]);
    expect(playback.audioState).toEqual({ request, position: 19, playing: !paused });
    expect(request).toMatchObject({ url: "lume://track/2", position: 0, shouldPlay: true });
    await expect.poll(() => parseQueueSession(playback.stored(), library)?.position).toBe(19);

    const shuffled = playback.controller.getSnapshot().queue;
    const writes = playback.writes.slice();
    allowRandom = false;
    playback.controller.setShuffleEnabled(true);
    await settle();
    expect(playback.controller.getSnapshot().queue).toBe(shuffled);
    expect(playback.writes).toEqual(writes);
    expect(playback.audioState).toEqual({ request, position: 19, playing: !paused });

    playback.controller.setShuffleEnabled(false);
    expect(
      playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId),
    ).toEqual([3, 4]);
    expect(playback.controller.getSnapshot().queue).toMatchObject({
      shuffleEnabled: false,
      status: paused ? "paused" : "playing",
      current: { item: { trackId: 2 } },
    });
    await expect
      .poll(() => parseQueueSession(playback.stored(), library)?.state.shuffleEnabled)
      .toBe(false);
    const ordered = playback.controller.getSnapshot().queue;
    const orderedWrites = playback.writes.slice();
    playback.controller.setShuffleEnabled(false);
    await settle();
    expect(playback.controller.getSnapshot().queue).toBe(ordered);
    expect(playback.writes).toEqual(orderedWrites);
    expect(playback.audioState).toEqual({ request, position: 19, playing: !paused });
  },
);

it("starts fresh shuffle sessions at zero while preserving manual priority", async () => {
  let random = 0;

  const playlist = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [
      { id: 11, trackId: 1, position: 0, addedAt: 0 },
      { id: 12, trackId: 2, position: 1, addedAt: 1 },
    ],
  } satisfies PlaylistDetails;

  const playback = await createReadyPlayback(
    {
      kind: "library",
      playlists: [{ id: 1, title: "Source", description: null, trackCount: 2 }],
      sources: [],
      tracks: [1, 2, 3].map(track),
    },
    {
      loadPlaylist: () => Promise.resolve(playlist),
      random: () => random,
    },
  );

  playback.controller.playSourceEntry(playlistView(playlist), 11);
  playback.controller.enqueueTracks([3], "end");
  playback.controller.shufflePlay(playlistView(playlist));
  const first = playback.controller.getSnapshot().queue;
  expect(first?.current?.item.trackId).toBe(2);
  expect(first?.sourceQueue.map((item) => item.trackId)).toEqual([1]);
  const removed = first?.sourceQueue[0];

  if (!removed) throw new Error("Expected an upcoming source item");
  playback.controller.removeQueueItem(removed.queueItemId);
  playback.controller.seek(19);
  playback.controller.pause();
  random = 0.999999;
  playback.controller.shufflePlay(playlistView(playlist));
  const second = playback.controller.getSnapshot().queue;

  expect(second).toMatchObject({
    shuffleEnabled: true,
    status: "playing",
    current: { item: { trackId: 1 } },
    suppressedSourceEntryIds: [],
  });
  expect(second?.sourceQueue.map((item) => item.trackId)).toEqual([2]);
  expect(second?.manualQueue.map((item) => item.trackId)).toEqual([3]);
  expect(playback.audioState.request).toMatchObject({ position: 0, shouldPlay: true });
  expect(playback.audioState.position).toBe(0);
  expect(playback.audioState.playing).toBe(true);
  playback.controller.next();
  expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(3);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/3",
    position: 0,
    shouldPlay: true,
  });
});

it("restores a shuffled queue and position exactly, paused without new randomness", async () => {
  const library = {
    kind: "library",
    playlists: [],
    sources: [],
    tracks: [1, 2, 3, 4].map(track),
  } satisfies MusicLibrary;

  const original = await createReadyPlayback(library);
  original.controller.playSourceEntry(allTracks(original.controller), 2);
  original.controller.setShuffleEnabled(true);
  original.controller.enqueueTracks([4], "end");

  const suppressed = original.controller
    .getSnapshot()
    .queue?.sourceQueue.find((item) => item.trackId === 3);

  if (!suppressed) throw new Error("Expected source track 3");
  original.controller.removeQueueItem(suppressed.queueItemId);
  original.controller.seek(19);
  original.controller.flush();
  const saved = original.flushes.at(-1) ?? null;

  const restored = createTestPlayback({
    storage: {
      load: () => Promise.resolve(saved),
      save: () => Promise.resolve(),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
    random: () => {
      throw new Error("Restoration must not randomize");
    },
  });

  restored.controller.syncLibrary(library);
  await expect.poll(() => restored.controller.getSnapshot().isInitialized).toBe(true);

  expect(restored.controller.getSnapshot().queue).toEqual({
    ...original.controller.getSnapshot().queue,
    status: "paused",
  });
  expect(restored.controller.getSnapshot().queue).toMatchObject({
    shuffleEnabled: true,
    status: "paused",
    current: { item: { trackId: 2 } },
    suppressedSourceEntryIds: [3],
  });
  expect(restored.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([
    4, 1,
  ]);
  expect(restored.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId)).toEqual([
    4,
  ]);
  expect(restored.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 19,
    shouldPlay: false,
  });
  expect(restored.audioState.position).toBe(19);
  expect(restored.audioState.playing).toBe(false);
});

it("refreshes a late playlist read after a committed edit before restarting at queue end", async () => {
  let finishRead: ((playlist: PlaylistDetails | null) => void) | undefined;

  const pending = new Promise<PlaylistDetails | null>((resolve) => {
    finishRead = resolve;
  });

  const original = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [
      { id: 11, trackId: 1, position: 0, addedAt: 0 },
      { id: 12, trackId: 2, position: 1, addedAt: 1 },
    ],
  } satisfies PlaylistDetails;

  const updated = { ...original, tracks: [{ id: 12, trackId: 2, position: 0, addedAt: 0 }] };

  const playback = await createReadyPlayback(
    {
      kind: "library",
      playlists: [{ id: 1, title: "Source", description: null, trackCount: 2 }],
      sources: [],
      tracks: [1, 2].map(track),
    },
    {
      loadPlaylist: () => (finishRead ? pending : Promise.resolve(updated)),
    },
  );

  playback.controller.playSourceEntry(playlistView(original), 12);
  playback.controller.next();
  playback.controller.applySourceChange({
    type: "sourceEntriesRemoved",
    playlistId: 1,
    sourceEntryIds: [11],
  });
  const resolve = finishRead;

  if (!resolve) throw new Error("Expected the playlist read to start");
  finishRead = undefined;
  resolve(original);

  await expect
    .poll(() => playback.controller.getSnapshot().queue?.sourceEntries)
    .toEqual([{ sourceEntryId: 12, trackId: 2 }]);
  expect(playback.controller.getSnapshot().queue).toMatchObject({
    status: "paused",
    current: { item: { trackId: 2 } },
  });
  expect(playback.controller.getSnapshot().queue?.sourceQueue).toEqual([]);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 0,
    shouldPlay: false,
  });
});

it("restarts the current shuffled row in place and ignores events from its old load", async () => {
  const playback = await createReadyPlayback({
    kind: "library",
    playlists: [],
    sources: [],
    tracks: [1, 2, 3].map(track),
  });

  playback.controller.playSourceEntry(allTracks(playback.controller), 2);
  playback.controller.setShuffleEnabled(true);
  const old = playback.audioState.request;
  playback.controller.seek(19);
  playback.controller.playSourceEntry(allTracks(playback.controller), 2);
  const current = playback.audioState.request;

  if (!old || !current) throw new Error("Expected both audio loads");
  expect(current.queueItemId).toBe(old.queueItemId);
  expect(playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([
    3, 1,
  ]);
  playback.controller.handleAudioEvent({
    type: "ended",
    requestId: old.requestId,
    queueItemId: old.queueItemId,
  });
  playback.controller.handleAudioEvent({
    type: "error",
    requestId: old.requestId,
    queueItemId: old.queueItemId,
    reason: "rejected",
  });
  expect(playback.controller.getSnapshot()).toMatchObject({
    errorMessage: null,
    queue: { status: "playing", current: { item: { trackId: 2 } } },
  });
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 0,
    shouldPlay: true,
  });
  expect(playback.audioState.position).toBe(0);
  playback.controller.handleAudioEvent({
    type: "paused",
    requestId: current.requestId,
    queueItemId: current.queueItemId,
  });
  expect(playback.controller.getSnapshot().queue?.status).toBe("paused");
  playback.controller.handleAudioEvent({
    type: "started",
    requestId: current.requestId,
    queueItemId: current.queueItemId,
  });
  expect(playback.controller.getSnapshot().queue?.status).toBe("playing");
});

it("saves only the latest pending queue and flushes the final position before closing", async () => {
  let finishSave: (() => void) | undefined;

  const pending = new Promise<void>((resolve) => {
    finishSave = resolve;
  });

  let holdSave = true;

  const playback = createTestPlayback({
    storage: {
      load: () => Promise.resolve(null),
      save: () => (holdSave ? pending : Promise.resolve()),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
  });

  const library = {
    kind: "library",
    playlists: [],
    sources: [],
    tracks: [1, 2, 3].map(track),
  } satisfies MusicLibrary;

  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  playback.controller.playSourceEntry(allTracks(playback.controller), 2);
  await expect.poll(() => describeWrites(playback.writes, library)).toEqual(["queue 2 at 0"]);
  playback.controller.setShuffleEnabled(true);
  playback.controller.enqueueTracks([3], "end");
  playback.controller.seek(7);
  playback.controller.seek(19);
  holdSave = false;

  if (!finishSave) throw new Error("Expected an in-flight save");
  finishSave();
  await expect
    .poll(() => describeWrites(playback.writes, library))
    .toEqual(["queue 2 at 0", "queue 2 at 19"]);
  const saved = parseQueueSession(playback.stored(), library);
  expect(saved?.state).toMatchObject({ shuffleEnabled: true, current: { item: { trackId: 2 } } });
  expect(saved?.state.manualQueue.map((item) => item.trackId)).toEqual([3]);
  expect(saved?.state.sourceQueue.map((item) => item.trackId)).toEqual([3, 1]);
  playback.controller.seek(23);
  playback.controller.flush();
  playback.controller.next();
  playback.controller.setShuffleEnabled(false);
  await settle();
  const flushed = parseQueueSession(playback.flushes.at(-1) ?? null, library);
  expect(flushed?.position).toBe(23);
  expect(flushed?.state).toEqual(saved?.state);
  expect(describeWrites(playback.writes, library)).toEqual(["queue 2 at 0", "queue 2 at 19"]);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 0,
    shouldPlay: true,
  });
  expect(playback.audioState.position).toBe(23);
  expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(2);
});

it("saves only the position until the queue changes, and the queue again after a failed save", async () => {
  let failSave = false;

  const playback = createTestPlayback({
    storage: {
      load: () => Promise.resolve(null),
      save: () => (failSave ? Promise.reject(new Error("Disk full")) : Promise.resolve()),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
  });

  const library = {
    kind: "library",
    playlists: [],
    sources: [],
    tracks: [1, 2, 3, 4].map(track),
  } satisfies MusicLibrary;

  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  await settle();
  playback.controller.onPosition(1);
  await settle();
  playback.controller.onPosition(2);
  await settle();
  playback.controller.next();
  await settle();
  failSave = true;
  playback.controller.next();
  await settle();
  failSave = false;
  playback.controller.onPosition(4);
  await settle();
  playback.controller.onPosition(5);
  await settle();

  expect(describeWrites(playback.writes, library)).toEqual([
    "queue 1 at 0",
    "position 1",
    "position 2",
    "queue 2 at 0",
    "queue 3 at 0",
    "queue 3 at 4",
    "position 5",
  ]);
  expect(playback.controller.getSnapshot().errorMessage).toBe("Disk full");
  expect(parseQueueSession(playback.stored(), library)).toMatchObject({
    position: 5,
    state: { current: { item: { trackId: 3 } } },
  });
});

it("rebuilds a shuffled queue from another source and keeps the manual queue", async () => {
  const playlist = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [1, 2, 3].map((trackId, position) => ({
      id: trackId + 10,
      trackId,
      position,
      addedAt: position,
    })),
  } satisfies PlaylistDetails;

  const playback = await createReadyPlayback(
    {
      kind: "library",
      playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
      sources: [],
      tracks: [1, 2, 3, 4].map(track),
    },
    { loadPlaylist: () => Promise.resolve(playlist) },
  );

  playback.controller.playSourceEntry(allTracks(playback.controller), 2);
  playback.controller.setShuffleEnabled(true);
  playback.controller.enqueueTracks([4], "end");
  playback.controller.playSourceEntry(playlistView(playlist), 11);

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    sourceIdentity: { kind: "playlist", playlistId: 1 },
    shuffleEnabled: true,
    status: "playing",
    current: { item: { trackId: 1 } },
  });
  expect(playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([
    3, 2,
  ]);
  expect(playback.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId)).toEqual([
    4,
  ]);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/1",
    position: 0,
    shouldPlay: true,
  });
});

it("starts a filtered view at the clicked row, in displayed order", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2, 3, 4]));

  playback.controller.playSourceEntry(tracksView([3, 1, 2], "a"), 1);

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    filter: "a",
    sourceEntries: [3, 1, 2].map((id) => ({ sourceEntryId: id, trackId: id })),
    status: "playing",
    current: { item: { trackId: 1 } },
  });
  expect(
    playback.controller.getSnapshot().queue?.previousSourceItems.map((item) => item.trackId),
  ).toEqual([3]);
  expect(playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([
    2,
  ]);
});

it("plays a row clicked under a different filter while shuffle is on", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2, 3, 4]));

  playback.controller.playSourceEntry(tracksView([1, 2], "a"), 1);
  playback.controller.setShuffleEnabled(true);
  const shuffled = playback.controller.getSnapshot().queue;

  playback.controller.playSourceEntry(tracksView([3, 4], "b"), 4);

  const queue = playback.controller.getSnapshot().queue;
  expect(queue?.sessionId).not.toBe(shuffled?.sessionId);
  expect(queue).toMatchObject({
    filter: "b",
    shuffleEnabled: true,
    status: "playing",
    current: { item: { trackId: 4 } },
  });
  expect(queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);
  expect(playback.audioState.request).toMatchObject({ url: "lume://track/4", shouldPlay: true });
});

it("selects within a shuffled filtered session when clicked under the same filter", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2, 3]));

  playback.controller.playSourceEntry(tracksView([1, 2, 3], "a"), 1);
  playback.controller.setShuffleEnabled(true);
  const sessionId = playback.controller.getSnapshot().queue?.sessionId;

  playback.controller.playSourceEntry(tracksView([3, 2, 1], "a"), 3);

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    sessionId,
    current: { item: { trackId: 3 } },
  });
});

it.each([false, true])(
  "replays a filtered session's own rows, paused, at queue end, shuffle=%s",
  async (shuffled) => {
    const playback = createTestPlayback({
      loadPlaylist: () => {
        throw new Error("A filtered session must not re-read its playlist");
      },
    });

    playback.controller.syncLibrary({
      ...libraryOf([1, 2, 3, 4]),
      playlists: [{ id: 1, title: "Mix", description: null, trackCount: 4 }],
    });
    await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

    const view = {
      source: { kind: "playlist", playlistId: 1, title: "Mix" },
      entries: [
        { sourceEntryId: 14, trackId: 4 },
        { sourceEntryId: 12, trackId: 2 },
      ],
      filter: "a",
      sort: defaultSort,
    } satisfies SessionSource;

    playback.controller.playSourceEntry(view, 12);

    if (shuffled) playback.controller.setShuffleEnabled(true);

    playback.controller.next();

    if (shuffled) playback.controller.next();

    const queue = playback.controller.getSnapshot().queue;
    expect(queue).toMatchObject({
      filter: "a",
      shuffleEnabled: shuffled,
      status: "paused",
      sourceEntries: view.entries,
    });

    const order = [
      queue?.current?.item.trackId,
      ...(queue?.sourceQueue ?? []).map((item) => item.trackId),
    ];

    expect(shuffled ? order.toSorted((left = 0, right = 0) => left - right) : order).toEqual(
      shuffled ? [2, 4] : [4, 2],
    );
    expect(playback.audioState.request).toMatchObject({ position: 0, shouldPlay: false });
    expect(playback.controller.getSnapshot().errorMessage).toBeNull();
  },
);

it("re-reads the library for an unfiltered session at queue end", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2]));

  playback.controller.playSourceEntry(tracksView([2, 1], null), 1);
  playback.controller.syncLibrary(libraryOf([1, 2, 3]));
  playback.controller.next();
  playback.controller.next();

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    filter: null,
    status: "paused",
    current: { item: { trackId: 1 } },
  });
  expect(playback.controller.getSnapshot().queue?.sourceEntries.map((e) => e.trackId)).toEqual([
    1, 2, 3,
  ]);
});

it("keeps a restored filtered session unchanged through rescans", async () => {
  const original = await createReadyPlayback(libraryOf([1, 2, 3]));
  original.controller.playSourceEntry(tracksView([3, 1], "a"), 3);
  original.controller.flush();
  const saved = original.flushes.at(-1) ?? null;

  const restored = await createReadyPlayback(libraryOf([1, 2, 3, 4]), {
    storage: {
      load: () => Promise.resolve(saved),
      save: () => Promise.resolve(),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
  });

  const queue = restored.controller.getSnapshot().queue;

  expect(queue).toEqual({ ...original.controller.getSnapshot().queue, status: "paused" });

  restored.controller.syncLibrary(libraryOf([1, 2, 3, 4, 5]));
  expect(restored.controller.getSnapshot().queue).toBe(queue);
});

const titleSort = trackSort("title", "asc");

function fruitLibrary(extra: Track[] = []): MusicLibrary {
  return {
    kind: "library",
    playlists: [{ id: 1, title: "Fruit", description: null, trackCount: 3 }],
    sources: [],
    tracks: [
      { ...track(1), title: "Cherry", duration: 10, addedAt: 1 },
      { ...track(2), title: "apple", duration: 30, addedAt: 2 },
      { ...track(3), title: "Banana", duration: 20, addedAt: 3 },
      ...extra,
    ],
  };
}

function trackIds(entries: readonly { trackId: number }[] | undefined) {
  return entries?.map((entry) => entry.trackId);
}

it("restarts an all-tracks session in the order it started, not the view's later sort", async () => {
  const playback = createTestPlayback();
  const library = fruitLibrary();
  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  playback.controller.playSourceEntry(
    {
      source: { kind: "all-tracks" },
      entries: libraryEntries(library, titleSort),
      filter: null,
      sort: titleSort,
    },
    1,
  );
  stepViewSort({ kind: "all-tracks" }, "duration");
  playback.controller.next();

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    sort: titleSort,
    status: "paused",
    current: { item: { trackId: 2 } },
  });
  expect(trackIds(playback.controller.getSnapshot().queue?.sourceEntries)).toEqual([2, 3, 1]);
});

it("appends rescanned tracks at the end, in the session's order", async () => {
  const playback = createTestPlayback();
  const library = fruitLibrary();
  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  playback.controller.playSourceEntry(
    {
      source: { kind: "all-tracks" },
      entries: libraryEntries(library, titleSort),
      filter: null,
      sort: titleSort,
    },
    2,
  );
  playback.controller.syncLibrary(
    fruitLibrary([
      { ...track(4), title: "Date", addedAt: 4 },
      { ...track(5), title: "Aardvark", addedAt: 5 },
    ]),
  );

  const queue = playback.controller.getSnapshot().queue;
  expect(trackIds(queue?.sourceEntries)).toEqual([2, 3, 1, 5, 4]);
  expect(trackIds(queue?.sourceQueue)).toEqual([3, 1, 5, 4]);
});

it("re-reads a playlist at queue end sorted by the session's sort, using membership time", async () => {
  const newestFirst = trackSort("added", "desc");

  const entry = (id: number, trackId: number, position: number, addedAt: number) => ({
    id,
    trackId,
    position,
    addedAt,
  });

  const playlist = {
    id: 1,
    title: "Fruit",
    description: null,
    tracks: [entry(11, 1, 0, 100), entry(12, 2, 1, 300), entry(13, 3, 2, 200)],
  } satisfies PlaylistDetails;

  let current: PlaylistDetails = playlist;
  const playback = createTestPlayback({ loadPlaylist: () => Promise.resolve(current) });
  const library = fruitLibrary([{ ...track(4), title: "Date", addedAt: 4 }]);
  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));
  playback.controller.playSourceEntry(
    {
      source: { kind: "playlist", playlistId: 1, title: "Fruit" },
      entries: playlistEntries(playlist, tracksById, newestFirst),
      filter: null,
      sort: newestFirst,
    },
    11,
  );
  current = { ...playlist, tracks: [...playlist.tracks, entry(14, 4, 3, 50)] };
  playback.controller.next();

  await expect
    .poll(() => trackIds(playback.controller.getSnapshot().queue?.sourceEntries))
    .toEqual([2, 3, 1, 4]);
  expect(playback.controller.getSnapshot().queue).toMatchObject({
    sort: newestFirst,
    current: { item: { trackId: 2 } },
  });
});

it("appends a playlist addition to a sorted session", async () => {
  const playlist = {
    id: 1,
    title: "Fruit",
    description: null,
    tracks: [1, 2, 3].map((trackId, position) => ({
      id: trackId + 10,
      trackId,
      position,
      addedAt: position,
    })),
  } satisfies PlaylistDetails;

  const playback = createTestPlayback({ loadPlaylist: () => Promise.resolve(playlist) });
  const library = fruitLibrary([{ ...track(4), title: "Aardvark", addedAt: 4 }]);
  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));
  playback.controller.playSourceEntry(
    {
      source: { kind: "playlist", playlistId: 1, title: "Fruit" },
      entries: playlistEntries(playlist, tracksById, titleSort),
      filter: null,
      sort: titleSort,
    },
    12,
  );
  playback.controller.applySourceChange({
    type: "sourceEntriesAdded",
    playlistId: 1,
    entries: [{ sourceEntryId: 14, trackId: 4 }],
  });

  const queue = playback.controller.getSnapshot().queue;
  expect(trackIds(queue?.sourceEntries)).toEqual([2, 3, 1, 4]);
  expect(trackIds(queue?.sourceQueue)).toEqual([3, 1, 4]);
});

it("restores a session's sort after a relaunch", async () => {
  const titleDesc = trackSort("title", "desc");
  const original = createTestPlayback();
  const library = fruitLibrary();
  original.controller.syncLibrary(library);
  await expect.poll(() => original.controller.getSnapshot().isInitialized).toBe(true);
  original.controller.playSourceEntry(
    {
      source: { kind: "all-tracks" },
      entries: libraryEntries(library, titleDesc),
      filter: null,
      sort: titleDesc,
    },
    1,
  );
  original.controller.flush();
  const saved = original.flushes.at(-1) ?? null;

  const restored = await createReadyPlayback(
    fruitLibrary([
      { ...track(4), title: "Aardvark", addedAt: 4 },
      { ...track(5), title: "Zucchini", addedAt: 5 },
    ]),
    {
      storage: {
        load: () => Promise.resolve(saved),
        save: () => Promise.resolve(),
        savePosition: () => Promise.resolve(),
        flush: () => {},
      },
    },
  );

  expect(restored.controller.getSnapshot().queue?.sort).toEqual(titleDesc);
  expect(trackIds(restored.controller.getSnapshot().queue?.sourceEntries)).toEqual([1, 3, 2, 5, 4]);
});

it("restores no queue and shows no error for a version 5 session", async () => {
  const original = await createReadyPlayback(libraryOf([1, 2]));
  original.controller.playSourceEntry(allTracks(original.controller), 1);
  original.controller.flush();
  const saved = original.flushes.at(-1);

  if (!saved) throw new Error("Expected a flushed session");
  const { state } = JSON.parse(saved.payload);
  delete state.filter;
  const payload = JSON.stringify({ version: 5, state });

  const restored = await createReadyPlayback(libraryOf([1, 2]), {
    storage: {
      load: () => Promise.resolve({ payload, position: 4 }),
      save: () => Promise.resolve(),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
  });

  expect(restored.controller.getSnapshot()).toMatchObject({ queue: null, errorMessage: null });
  expect(restored.requests).toEqual([]);
});

it("queues tracks in submitted order, repeats included, with one publication and no reload", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2, 3]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.seek(12);
  const requestCount = playback.requests.length;
  let publications = 0;
  playback.controller.subscribe(() => publications++);

  playback.controller.enqueueTracks([3, 2, 3], "end");

  const queue = playback.controller.getSnapshot().queue;
  expect(queue?.manualQueue.map((item) => item.trackId)).toEqual([3, 2, 3]);
  expect(new Set(queue?.manualQueue.map((item) => item.queueItemId)).size).toBe(3);
  expect(queue?.current?.item.trackId).toBe(1);
  expect(publications).toBe(1);
  expect(playback.requests).toHaveLength(requestCount);
  expect(playback.audioState).toMatchObject({ position: 12, playing: true });
});

it.each(["start", "end"] as const)(
  "ignores an enqueue at the %s when there is no playback session",
  async (position) => {
    const playback = await createReadyPlayback(libraryOf([1, 2]));
    let publications = 0;
    playback.controller.subscribe(() => publications++);

    playback.controller.enqueueTracks([1, 2], position);

    expect(playback.controller.getSnapshot().queue).toBeNull();
    expect(publications).toBe(0);
    expect(playback.requests).toEqual([]);
  },
);

it("plays next ahead of queued tracks without reloading the current track", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2, 3, 4, 5]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.enqueueTracks([5], "end");
  playback.controller.seek(12);
  const requestCount = playback.requests.length;
  const current = playback.controller.getSnapshot().queue?.current;

  playback.controller.enqueueTracks([4, 3, 4], "start");

  const queue = playback.controller.getSnapshot().queue;
  expect(queue?.manualQueue.map((item) => item.trackId)).toEqual([4, 3, 4, 5]);
  expect(queue?.current).toEqual(current);
  expect(playback.requests).toHaveLength(requestCount);
  expect(playback.audioState).toMatchObject({ position: 12, playing: true });
});

it("restores a Play next group ahead of earlier queued tracks", async () => {
  const original = await createReadyPlayback(libraryOf([1, 2, 3, 4, 5]));
  original.controller.playSourceEntry(allTracks(original.controller), 1);
  original.controller.enqueueTracks([5], "end");
  original.controller.enqueueTracks([3, 4], "start");
  original.controller.flush();
  const saved = original.flushes.at(-1) ?? null;

  const restored = await createReadyPlayback(libraryOf([1, 2, 3, 4, 5]), {
    storage: {
      load: () => Promise.resolve(saved),
      save: () => Promise.resolve(),
      savePosition: () => Promise.resolve(),
      flush: () => {},
    },
  });

  expect(restored.controller.getSnapshot().queue?.manualQueue).toEqual(
    original.controller.getSnapshot().queue?.manualQueue,
  );
  expect(restored.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId)).toEqual([
    3, 4, 5,
  ]);
});

it("starts the first queued track of a stopped session and clears the error in one publication", async () => {
  const playback = await createReadyPlayback(libraryOf([1]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.syncLibrary({
    ...libraryOf([1]),
    tracks: [{ ...track(1), available: false }],
  });
  playback.controller.next();
  playback.controller.syncLibrary({
    ...libraryOf([2, 3]),
    tracks: [{ ...track(1), available: false }, track(2), track(3)],
  });
  playback.controller.setError("This track is unavailable");
  expect(playback.controller.getSnapshot().queue).toMatchObject({
    status: "stopped",
    current: null,
  });
  const published: { errorMessage: string | null; current: number | undefined }[] = [];
  playback.controller.subscribe(() => {
    const snapshot = playback.controller.getSnapshot();
    published.push({
      errorMessage: snapshot.errorMessage,
      current: snapshot.queue?.current?.item.trackId,
    });
  });

  playback.controller.enqueueTracks([3, 2, 3], "end");

  expect(published).toEqual([{ errorMessage: null, current: 3 }]);
  expect(playback.controller.getSnapshot().queue).toMatchObject({
    status: "playing",
    current: { lane: "manual", item: { trackId: 3 } },
  });
  expect(playback.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId)).toEqual([
    2, 3,
  ]);
  expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/3", shouldPlay: true });
});

it("ignores commands until the restore finishes, then restores paused against the latest library", async () => {
  const saved = await savedSession(libraryOf([1, 2]), 1, 12);
  const load = deferred<SavedPlaybackSession | null>();
  const playback = createTestPlayback({ storage: loadingStorage(() => load.promise) });
  playback.controller.syncLibrary(libraryOf([1, 2]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 2);
  playback.controller.syncLibrary(libraryOf([1, 2, 3]));
  await settle();

  expect(playback.controller.getSnapshot()).toMatchObject({ isInitialized: false, queue: null });
  expect(playback.requests).toEqual([]);

  load.resolve(saved);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    status: "paused",
    current: { item: { trackId: 1 } },
  });
  expect(trackIds(playback.controller.getSnapshot().queue?.sourceEntries)).toEqual([1, 2, 3]);
  expect(playback.requests).toEqual([
    expect.objectContaining({ url: "lume://track/1", position: 12, shouldPlay: false }),
  ]);
  expect(playback.writes).toEqual([]);
});

it("recovers from a failed restore with an error and no queue, then plays normally", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2]), {
    storage: loadingStorage(() => Promise.reject(new Error("Database locked"))),
  });

  expect(playback.controller.getSnapshot()).toMatchObject({
    queue: null,
    errorMessage: "Database locked",
  });
  expect(playback.requests).toEqual([]);

  playback.controller.playSourceEntry(allTracks(playback.controller), 2);

  expect(playback.controller.getSnapshot()).toMatchObject({
    errorMessage: null,
    queue: { status: "playing", current: { item: { trackId: 2 } } },
  });
  expect(playback.requests).toEqual([
    expect.objectContaining({ url: "lume://track/2", shouldPlay: true }),
  ]);
});

it.each(["resolves", "rejects"] as const)(
  "drops a restore that %s after closing",
  async (outcome) => {
    const saved = await savedSession(libraryOf([1]), 1, 4);
    const load = deferred<SavedPlaybackSession | null>();
    const playback = createTestPlayback({ storage: loadingStorage(() => load.promise) });
    playback.controller.syncLibrary(libraryOf([1]));
    playback.controller.flush();
    const closed = playback.controller.getSnapshot();

    if (outcome === "resolves") load.resolve(saved);
    else load.reject(new Error("Database locked"));
    await settle();

    expect(playback.controller.getSnapshot()).toBe(closed);
    expect(closed).toMatchObject({ isInitialized: false, queue: null, errorMessage: null });
    expect(playback.requests).toEqual([]);
    expect(playback.writes).toEqual([]);
    expect(playback.flushes).toEqual([]);
  },
);

it("ignores audio events, positions, library syncs, playlist edits, and errors after closing", async () => {
  const playlist = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [
      { id: 10, trackId: 1, position: 0, addedAt: 0 },
      { id: 11, trackId: 2, position: 1, addedAt: 1 },
    ],
  } satisfies PlaylistDetails;

  const playback = await createReadyPlayback(libraryOf([1, 2]));
  playback.controller.playSourceEntry(playlistView(playlist), 10);
  const loaded = playback.requests.at(-1);

  if (!loaded) throw new Error("Expected the first track to load");
  playback.controller.flush();
  const closed = playback.controller.getSnapshot();
  playback.controller.handleAudioEvent({
    type: "ended",
    requestId: loaded.requestId,
    queueItemId: loaded.queueItemId,
  });
  playback.controller.onPosition(9);
  playback.controller.syncLibrary(libraryOf([1, 2, 3]));
  playback.controller.applySourceChange({
    type: "sourceEntriesRemoved",
    playlistId: 1,
    sourceEntryIds: [11],
  });
  playback.controller.setError("Late failure");
  await settle();

  expect(playback.controller.getSnapshot()).toBe(closed);
  expect(playback.requests).toEqual([loaded]);
  expect(playback.writes).toEqual([]);
  expect(playback.flushes).toHaveLength(1);
});

it("closing drops a queue-end restart that finishes reading its playlist afterwards", async () => {
  const read = deferred<PlaylistDetails | null>();
  const playback = await createReadyPlayback(libraryOf([1]), { loadPlaylist: () => read.promise });
  playback.controller.playSourceEntry(playlistView(singleTrackPlaylist), 10);
  playback.controller.next();
  playback.controller.flush();
  const closed = playback.controller.getSnapshot();
  read.resolve(singleTrackPlaylist);
  await settle();

  expect(playback.controller.getSnapshot()).toBe(closed);
  expect(closed.queue).toMatchObject({ status: "stopped", current: null });
  expect(playback.requests.at(-1)).toBeNull();
});

it("re-reads instead of failing when the playlist is edited during a failed queue-end read", async () => {
  const firstRead = deferred<PlaylistDetails | null>();
  const reads: number[] = [];

  const playback = createTestPlayback({
    loadPlaylist: (playlistId) => {
      reads.push(playlistId);

      return reads.length === 1 ? firstRead.promise : Promise.resolve(twoTrackPlaylist);
    },
  });

  playback.controller.syncLibrary(libraryOf([1, 2]));
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  playback.controller.playSourceEntry(playlistView(singleTrackPlaylist), 10);
  playback.controller.next();
  playback.controller.applySourceChange({
    type: "sourceEntriesAdded",
    playlistId: 1,
    entries: [{ sourceEntryId: 11, trackId: 2 }],
  });
  firstRead.reject(new Error("Playlist unavailable"));

  await expect.poll(() => playback.controller.getSnapshot().queue?.status).toBe("paused");
  expect(playback.controller.getSnapshot()).toMatchObject({
    errorMessage: null,
    queue: { current: { item: { trackId: 1 } } },
  });
  expect(trackIds(playback.controller.getSnapshot().queue?.sourceEntries)).toEqual([1, 2]);
  expect(reads).toEqual([1, 1]);
});

it("shows a failed queue-end playlist read and stays stopped", async () => {
  const read = deferred<PlaylistDetails | null>();
  const playback = await createReadyPlayback(libraryOf([1]), { loadPlaylist: () => read.promise });
  playback.controller.playSourceEntry(playlistView(singleTrackPlaylist), 10);
  playback.controller.next();
  read.reject(new Error("Playlist unavailable"));

  await expect
    .poll(() => playback.controller.getSnapshot().errorMessage)
    .toBe("Playlist unavailable");
  expect(playback.controller.getSnapshot().queue).toMatchObject({
    status: "stopped",
    current: null,
  });
});

it.each(["resolves", "rejects"] as const)(
  "keeps a new selection when the stale queue-end playlist read %s",
  async (outcome) => {
    const read = deferred<PlaylistDetails | null>();

    const playback = await createReadyPlayback(libraryOf([1, 2]), {
      loadPlaylist: () => read.promise,
    });

    playback.controller.playSourceEntry(playlistView(singleTrackPlaylist), 10);
    playback.controller.next();
    playback.controller.playSourceEntry(allTracks(playback.controller), 2);

    if (outcome === "resolves") read.resolve(singleTrackPlaylist);
    else read.reject(new Error("Playlist unavailable"));
    await settle();

    expect(playback.controller.getSnapshot()).toMatchObject({
      errorMessage: null,
      queue: {
        source: { kind: "all-tracks" },
        status: "playing",
        current: { item: { trackId: 2 } },
      },
    });
    expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/2", shouldPlay: true });
  },
);

it("resumes the loaded track in place without reloading it", async () => {
  const playback = await createReadyPlayback(libraryOf([1]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.pause();

  expect(playback.audioState.playing).toBe(false);

  playback.controller.resume();

  expect(playback.audioState.playing).toBe(true);
  expect(playback.requests).toHaveLength(1);
});

it("reloads a failed paused track as soon as Play is pressed, before its file check answers", async () => {
  const check = deferred<boolean>();

  const playback = await createReadyPlayback(libraryOf([1, 2]), {
    hasTrackFile: () => check.promise,
  });

  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.pause();
  const failed = playback.requests.at(-1);

  if (!failed) throw new Error("Expected the track to load");
  playback.controller.handleAudioEvent({
    type: "error",
    requestId: failed.requestId,
    queueItemId: failed.queueItemId,
    reason: "load",
  });

  expect(playback.controller.getSnapshot()).toMatchObject({
    errorMessage: "Could not play 1.",
    queue: { status: "paused", current: { item: { trackId: 1 } } },
  });

  playback.controller.resume();
  const reloaded = playback.requests.at(-1);

  expect(reloaded).toMatchObject({
    url: `lume://track/1?retry=${reloaded?.requestId}`,
    shouldPlay: true,
  });
  expect(reloaded?.requestId).not.toBe(failed.requestId);
  expect(playback.controller.getSnapshot().errorMessage).toBeNull();

  playback.controller.handleAudioEvent({
    type: "ended",
    requestId: failed.requestId,
    queueItemId: failed.queueItemId,
  });

  expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(1);

  check.resolve(false);
  await settle();

  expect(playback.controller.getSnapshot().errorMessage).toBeNull();
});

it.each([
  {
    reason: "load",
    exists: false,
    message: "Could not play Alpha. Its file was moved, deleted, or disconnected.",
    current: 2,
  },
  {
    reason: "load",
    exists: true,
    message: "Could not play Alpha. The file can’t be read or is in a format Lume can’t play.",
    current: 2,
  },
  {
    reason: "rejected",
    exists: true,
    message: "Could not play Alpha. Press Play to try again.",
    current: 1,
  },
] as const)(
  "says why a playing track failed: $reason, file exists=$exists",
  async ({ reason, exists, message, current }) => {
    const checked: number[] = [];

    const playback = await createReadyPlayback(
      { ...libraryOf([2]), tracks: [{ ...track(1), title: "Alpha" }, track(2)] },
      {
        hasTrackFile: (trackId) => {
          checked.push(trackId);

          return Promise.resolve(exists);
        },
      },
    );

    playback.controller.playSourceEntry(allTracks(playback.controller), 1);
    const loaded = playback.requests.at(-1);

    if (!loaded) throw new Error("Expected the track to load");
    playback.controller.handleAudioEvent({
      type: "started",
      requestId: loaded.requestId,
      queueItemId: loaded.queueItemId,
    });
    playback.controller.handleAudioEvent({
      type: "error",
      requestId: loaded.requestId,
      queueItemId: loaded.queueItemId,
      reason,
    });

    await expect.poll(() => playback.controller.getSnapshot().errorMessage).toBe(message);
    expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(current);
    expect(checked).toEqual(reason === "load" ? [1] : []);
  },
);

it("keeps the loaded track playing through a rescan without reloading it", async () => {
  const playback = await createReadyPlayback(libraryOf([1, 2]));
  playback.controller.playSourceEntry(allTracks(playback.controller), 1);
  playback.controller.seek(8);
  playback.controller.syncLibrary(libraryOf([1, 2, 3]));

  expect(playback.requests).toHaveLength(1);
  expect(playback.audioState).toMatchObject({ playing: true, position: 8 });
});

it("reloads a restored track at its saved position once a rescan makes it available", async () => {
  const saved = await savedSession(libraryOf([1, 2]), 1, 12);

  const playback = await createReadyPlayback(
    {
      ...libraryOf([2]),
      tracks: [{ ...track(1), available: false }, track(2)],
    },
    { storage: loadingStorage(() => Promise.resolve(saved)) },
  );

  expect(playback.requests).toEqual([null]);

  playback.controller.syncLibrary(libraryOf([1, 2]));

  expect(playback.requests.at(-1)).toMatchObject({
    url: "lume://track/1",
    position: 12,
    shouldPlay: false,
  });
});

it("skips a restored track that is still unavailable when resumed", async () => {
  const saved = await savedSession(libraryOf([1, 2]), 1, 12);

  const playback = await createReadyPlayback(
    {
      ...libraryOf([2]),
      tracks: [{ ...track(1), available: false }, track(2)],
    },
    { storage: loadingStorage(() => Promise.resolve(saved)) },
  );

  playback.controller.resume();

  expect(playback.controller.getSnapshot()).toMatchObject({
    errorMessage: "Could not play 1. It’s unavailable. Check its folder in Settings.",
    queue: { current: { item: { trackId: 2 } } },
  });
  expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/2" });
});

const twoTrackPlaylist = {
  id: 1,
  title: "Source",
  description: null,
  tracks: [
    { id: 10, trackId: 1, position: 0, addedAt: 0 },
    { id: 11, trackId: 2, position: 1, addedAt: 1 },
  ],
} satisfies PlaylistDetails;

const singleTrackPlaylist = {
  id: 1,
  title: "Source",
  description: null,
  tracks: [{ id: 10, trackId: 1, position: 0, addedAt: 0 }],
} satisfies PlaylistDetails;

async function savedSession(library: MusicLibrary, trackId: number, position: number) {
  const original = await createReadyPlayback(library);
  original.controller.playSourceEntry(allTracks(original.controller), trackId);
  original.controller.seek(position);
  original.controller.flush();

  return original.flushes.at(-1) ?? null;
}

function loadingStorage(
  load: () => Promise<SavedPlaybackSession | null>,
): LumeApi["playbackSession"] {
  return {
    load,
    save: () => Promise.resolve(),
    savePosition: () => Promise.resolve(),
    flush: () => {},
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};

  let reject: (error: Error) => void = () => {};

  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

function libraryOf(ids: readonly number[]): MusicLibrary {
  return { kind: "library", playlists: [], sources: [], tracks: ids.map(track) };
}

function tracksView(ids: readonly number[], filter: string | null): SessionSource {
  return {
    source: { kind: "all-tracks" },
    entries: ids.map((id) => ({ sourceEntryId: id, trackId: id })),
    filter,
    sort: defaultSort,
  };
}

function allTracks(
  controller: ReturnType<typeof createPlaybackController>,
  filter: string | null = null,
): SessionSource {
  const library = controller.getSnapshot().library;

  if (!library) throw new Error("Expected a synced library");

  return {
    source: { kind: "all-tracks" },
    entries: libraryEntries(library, defaultSort),
    filter,
    sort: defaultSort,
  };
}

function playlistView(playlist: PlaylistDetails, filter: string | null = null): SessionSource {
  return {
    source: { kind: "playlist", playlistId: playlist.id, title: playlist.title },
    entries: playlist.tracks.map((entry) => ({ sourceEntryId: entry.id, trackId: entry.trackId })),
    filter,
    sort: defaultSort,
  };
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

type TestAudioState = { request: PlaybackRequest | null; position: number; playing: boolean };

type TestWrite =
  | { kind: "session"; session: SavedPlaybackSession }
  | { kind: "position"; position: number };

function describeWrites(writes: readonly TestWrite[], library: MusicLibrary) {
  return writes.map((write) =>
    write.kind === "position"
      ? `position ${write.position}`
      : `queue ${parseQueueSession(write.session, library)?.state.current?.item.trackId} at ${write.session.position}`,
  );
}

async function createReadyPlayback(
  library: MusicLibrary,
  options: Parameters<typeof createTestPlayback>[0] = {},
) {
  const playback = createTestPlayback(options);
  playback.controller.syncLibrary(library);
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  return playback;
}

function createTestPlayback(
  options: {
    loadPlaylist?: LumeApi["loadPlaylist"];
    storage?: LumeApi["playbackSession"];
    hasTrackFile?: (trackId: number) => Promise<boolean>;
    random?: () => number;
  } = {},
) {
  const requests: (PlaybackRequest | null)[] = [];
  const seeks: number[] = [];
  const writes: TestWrite[] = [];
  const flushes: SavedPlaybackSession[] = [];
  let stored: SavedPlaybackSession | null = null;

  const audioState: TestAudioState = {
    request: null,
    position: 0,
    playing: false,
  };

  const media = {
    load: (request, time = request?.position ?? 0) => {
      requests.push(request);
      audioState.request = request;
      audioState.position = time;
      audioState.playing = request?.shouldPlay ?? false;
    },
    getPosition: () => audioState.position,
    play: () => {
      audioState.playing = true;
    },
    pause: () => {
      audioState.playing = false;
    },
    seek: (time) => {
      seeks.push(time);
      audioState.position = time;
    },
  } satisfies Parameters<typeof createPlaybackController>[0]["audio"];

  const controller = createPlaybackController({
    audio: media,
    storage: {
      load: () => options.storage?.load() ?? Promise.resolve(null),
      save: (session) => {
        writes.push({ kind: "session", session });
        stored = session;

        return options.storage?.save(session) ?? Promise.resolve();
      },
      savePosition: (position) => {
        writes.push({ kind: "position", position });
        stored = stored && { ...stored, position };

        return options.storage?.savePosition(position) ?? Promise.resolve();
      },
      flush: (session) => {
        flushes.push(session);
        options.storage?.flush(session);
      },
    },
    playlistReader: {
      read: async (playlistId) => (await options.loadPlaylist?.(playlistId)) ?? null,
    },
    hasTrackFile: options.hasTrackFile ?? (() => Promise.resolve(true)),
    random: options.random ?? (() => 0.37),
  });

  return {
    controller,
    media,
    requests,
    seeks,
    audioState,
    writes,
    flushes,
    stored: () => stored,
  };
}

function track(id: number): Track {
  return {
    addedAt: 0,
    album: "Album",
    albumArtists: [],
    artists: [],
    artworkUrl: null,
    available: true,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "wav",
    genres: [],
    id,
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: String(id),
    trackNumber: null,
    trackTotal: null,
    url: `lume://track/${id}`,
    year: null,
  };
}
