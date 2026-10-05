import { expect, it } from "vite-plus/test";
import type { LumeApi, MusicLibrary, PlaylistDetails, Track } from "../../shared/lib";
import { createPlaybackController } from "./playback-controller";
import type { PlaybackRequest } from "./playback-media";
import { parseQueueSession } from "./queue";

it.each([
  { source: "all-tracks", shuffled: false, expectedTracks: [3, 4] },
  { source: "playlist", shuffled: false, expectedTracks: [3] },
  { source: "all-tracks", shuffled: true, expectedTracks: [3, 1, 4] },
  { source: "playlist", shuffled: true, expectedTracks: [3, 1] },
] as const)(
  "resets an exhausted $source source paused after the manual queue finishes, shuffle=$shuffled",
  async ({ source, shuffled, expectedTracks }) => {
    const tracks = [{ ...track(1), available: false }, track(2), track(3), track(4)];

    const playback = createTestPlayback({
      loadPlaylist: () =>
        Promise.resolve({
          id: 1,
          title: "Source",
          description: null,
          tracks: tracks
            .slice(0, 3)
            .map((item, position) => ({ id: item.id + 10, trackId: item.id, position })),
        }),
    });

    playback.controller.syncLibrary({ kind: "library", sources: [], playlists: [], tracks });

    await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

    await playback.controller.playSourceEntry({
      source: source === "playlist" ? { kind: "playlist", playlistId: 1 } : { kind: "all-tracks" },
      sourceEntryId: source === "playlist" ? 13 : 4,
    });

    if (shuffled) {
      playback.controller.setShuffleEnabled(true);
      playback.controller.getSnapshot().queue?.sourceQueue.forEach((item) => {
        playback.controller.removeQueueItem(item.queueItemId);
      });
    }

    playback.controller.enqueueTrack(4);

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

it("does not replace a new selection when the finished playlist read resolves", async () => {
  let finishRead: ((playlist: PlaylistDetails | null) => void) | undefined;

  const pending = new Promise<PlaylistDetails | null>((resolve) => {
    finishRead = resolve;
  });

  let reads = 0;

  const playback = createTestPlayback({
    loadPlaylist: () =>
      reads++ === 0
        ? Promise.resolve({
            id: 1,
            title: "Source",
            description: null,
            tracks: [{ id: 10, trackId: 1, position: 0 }],
          })
        : pending,
  });

  const tracks = [track(1), track(2)];

  playback.controller.syncLibrary({ kind: "library", sources: [], playlists: [], tracks });

  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  await playback.controller.playSourceEntry({
    source: { kind: "playlist", playlistId: 1 },
    sourceEntryId: 10,
  });
  playback.controller.next();
  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });

  if (!finishRead) throw new Error("Expected the playlist read to start");
  finishRead({
    id: 1,
    title: "Source",
    description: null,
    tracks: [{ id: 10, trackId: 1, position: 0 }],
  });

  await pending;

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    source: { kind: "all-tracks" },
    current: { item: { trackId: 2 } },
    status: "playing",
  });
  expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/2", shouldPlay: true });
});

it("stays stopped when the source no longer has any available tracks", async () => {
  const playback = createTestPlayback();
  playback.controller.syncLibrary({
    kind: "library",
    sources: [],
    playlists: [],
    tracks: [track(1)],
  });

  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 1 });

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
  const controller = createTestPlayback({
    loadPlaylist: () =>
      Promise.resolve({
        id: 1,
        title: "Source",
        description: null,
        tracks: [1, 2, 3].map((trackId, position) => ({ id: trackId, trackId, position })),
      }),
  }).controller;

  const library = {
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
    sources: [],
    tracks: [track(1), track(2), track(3), track(4)],
  } satisfies MusicLibrary;

  controller.syncLibrary(library);
  await expect.poll(() => controller.getSnapshot().isInitialized).toBe(true);
  await controller.playSourceEntry({
    source: { kind: "playlist", playlistId: 1 },
    sourceEntryId: 1,
  });

  controller.applySourceChange({ type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  controller.applySourceChange({
    type: "sourceEntryAdded",
    playlistId: 1,
    entry: { sourceEntryId: 4, trackId: 4 },
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
  await controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });

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
    await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
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
    await expect
      .poll(() => parseQueueSession(playback.saves.at(-1) ?? null, library)?.position)
      .toBe(19);

    const shuffled = playback.controller.getSnapshot().queue;
    const saves = playback.saves.slice();
    allowRandom = false;
    playback.controller.setShuffleEnabled(true);
    await settle();
    expect(playback.controller.getSnapshot().queue).toBe(shuffled);
    expect(playback.saves).toEqual(saves);
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
      .poll(() => parseQueueSession(playback.saves.at(-1) ?? null, library)?.state.shuffleEnabled)
      .toBe(false);
    const ordered = playback.controller.getSnapshot().queue;
    const orderedSaves = playback.saves.slice();
    playback.controller.setShuffleEnabled(false);
    await settle();
    expect(playback.controller.getSnapshot().queue).toBe(ordered);
    expect(playback.saves).toEqual(orderedSaves);
    expect(playback.audioState).toEqual({ request, position: 19, playing: !paused });
  },
);

it("starts fresh shuffle sessions at zero while preserving manual priority", async () => {
  let random = 0;

  const playback = createTestPlayback({
    loadPlaylist: () =>
      Promise.resolve({
        id: 1,
        title: "Source",
        description: null,
        tracks: [
          { id: 11, trackId: 1, position: 0 },
          { id: 12, trackId: 2, position: 1 },
        ],
      }),
    random: () => random,
  });

  playback.controller.syncLibrary({
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 2 }],
    sources: [],
    tracks: [1, 2, 3].map(track),
  });
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  await playback.controller.playSourceEntry({
    source: { kind: "playlist", playlistId: 1 },
    sourceEntryId: 11,
  });
  playback.controller.enqueueTrack(3);
  await playback.controller.shufflePlay({ kind: "playlist", playlistId: 1 });
  const first = playback.controller.getSnapshot().queue;
  expect(first?.current?.item.trackId).toBe(2);
  expect(first?.sourceQueue.map((item) => item.trackId)).toEqual([1]);
  const removed = first?.sourceQueue[0];

  if (!removed) throw new Error("Expected an upcoming source item");
  playback.controller.removeQueueItem(removed.queueItemId);
  playback.controller.seek(19);
  playback.controller.pause();
  random = 0.999999;
  await playback.controller.shufflePlay({ kind: "playlist", playlistId: 1 });
  const second = playback.controller.getSnapshot().queue;

  // The removed entry plays first, so the fresh session cleared its suppression
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

  const original = createTestPlayback();
  original.controller.syncLibrary(library);
  await expect.poll(() => original.controller.getSnapshot().isInitialized).toBe(true);
  await original.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
  original.controller.setShuffleEnabled(true);
  original.controller.enqueueTrack(4);

  const suppressed = original.controller
    .getSnapshot()
    .queue?.sourceQueue.find((item) => item.trackId === 3);

  if (!suppressed) throw new Error("Expected source track 3");
  original.controller.removeQueueItem(suppressed.queueItemId);
  original.controller.seek(19);
  original.controller.flush();
  const saved = original.flushes.at(-1) ?? null;

  const restored = createTestPlayback({
    storage: { load: () => Promise.resolve(saved), save: () => Promise.resolve(), flush: () => {} },
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

it("refreshes a late playlist read after a committed edit before shuffle play", async () => {
  let finishRead: ((playlist: PlaylistDetails | null) => void) | undefined;

  const pending = new Promise<PlaylistDetails | null>((resolve) => {
    finishRead = resolve;
  });

  const updated = {
    id: 1,
    title: "Source",
    description: null,
    tracks: [{ id: 12, trackId: 2, position: 0 }],
  } satisfies PlaylistDetails;

  const playback = createTestPlayback({
    loadPlaylist: () => (finishRead ? pending : Promise.resolve(updated)),
  });

  playback.controller.syncLibrary({
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 2 }],
    sources: [],
    tracks: [1, 2].map(track),
  });
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  const action = playback.controller.shufflePlay({ kind: "playlist", playlistId: 1 });
  playback.controller.applySourceChange({
    type: "sourceEntryRemoved",
    playlistId: 1,
    sourceEntryId: 11,
  });
  const resolve = finishRead;

  if (!resolve) throw new Error("Expected the playlist read to start");
  finishRead = undefined;
  resolve({
    ...updated,
    tracks: [
      { id: 11, trackId: 1, position: 0 },
      { id: 12, trackId: 2, position: 1 },
    ],
  });
  await action;

  expect(playback.controller.getSnapshot().queue).toMatchObject({
    shuffleEnabled: true,
    status: "playing",
    current: { item: { trackId: 2 } },
  });
  expect(playback.controller.getSnapshot().queue?.sourceEntries).toEqual([
    { sourceEntryId: 12, trackId: 2 },
  ]);
  expect(playback.controller.getSnapshot().queue?.sourceQueue).toEqual([]);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 0,
    shouldPlay: true,
  });
});

it("restarts the current shuffled row in place and ignores events from its old load", async () => {
  const playback = createTestPlayback();
  playback.controller.syncLibrary({
    kind: "library",
    playlists: [],
    sources: [],
    tracks: [1, 2, 3].map(track),
  });
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
  playback.controller.setShuffleEnabled(true);
  const old = playback.audioState.request;
  playback.controller.seek(19);
  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
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
    source: "play",
    message: "Old load failed",
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
  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
  await expect
    .poll(() => parseQueueSession(playback.saves[0] ?? null, library)?.state.current?.item.trackId)
    .toBe(2);
  playback.controller.setShuffleEnabled(true);
  playback.controller.enqueueTrack(3);
  playback.controller.seek(7);
  playback.controller.seek(19);
  holdSave = false;

  if (!finishSave) throw new Error("Expected an in-flight save");
  finishSave();
  await expect
    .poll(() => playback.saves.map((payload) => parseQueueSession(payload, library)?.position))
    .toEqual([0, 19]);
  const saved = parseQueueSession(playback.saves.at(-1) ?? null, library);
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
  expect(playback.saves.map((payload) => parseQueueSession(payload, library)?.position)).toEqual([
    0, 19,
  ]);
  expect(playback.audioState.request).toMatchObject({
    url: "lume://track/2",
    position: 0,
    shouldPlay: true,
  });
  expect(playback.audioState.position).toBe(23);
  expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(2);
});

it("rebuilds a shuffled queue from another source and keeps the manual queue", async () => {
  const playback = createTestPlayback({
    loadPlaylist: () =>
      Promise.resolve({
        id: 1,
        title: "Source",
        description: null,
        tracks: [1, 2, 3].map((trackId, position) => ({ id: trackId + 10, trackId, position })),
      }),
  });

  playback.controller.syncLibrary({
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
    sources: [],
    tracks: [1, 2, 3, 4].map(track),
  });
  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);
  await playback.controller.playSourceEntry({ source: { kind: "all-tracks" }, sourceEntryId: 2 });
  playback.controller.setShuffleEnabled(true);
  playback.controller.enqueueTrack(4);
  await playback.controller.playSourceEntry({
    source: { kind: "playlist", playlistId: 1 },
    sourceEntryId: 11,
  });

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

/** Let any scheduled save run before a test checks that none was added. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

type TestAudioState = { request: PlaybackRequest | null; position: number; playing: boolean };

function createTestPlayback(
  options: {
    loadPlaylist?: LumeApi["loadPlaylist"];
    storage?: LumeApi["playbackSession"];
    random?: () => number;
  } = {},
) {
  const requests: (PlaybackRequest | null)[] = [];
  const seeks: number[] = [];
  const saves: string[] = [];
  const flushes: string[] = [];

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
    hasRequest: () => audioState.request !== null,
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
      save: (payload) => {
        saves.push(payload);

        return options.storage?.save(payload) ?? Promise.resolve();
      },
      flush: (payload) => {
        flushes.push(payload);
        options.storage?.flush(payload);
      },
    },
    sourceReader: {
      read: async (source) => {
        if (source.kind === "all-tracks") return null;
        const playlist = (await options.loadPlaylist?.(source.playlistId)) ?? null;

        return (
          playlist && {
            source: { kind: "playlist", playlistId: playlist.id, title: playlist.title },
            entries: playlist.tracks.map((entry) => ({
              sourceEntryId: entry.id,
              trackId: entry.trackId,
            })),
          }
        );
      },
    },
    random: options.random ?? (() => 0.37),
  });

  return { controller, media, requests, seeks, audioState, saves, flushes };
}

function track(id: number): Track {
  return {
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
