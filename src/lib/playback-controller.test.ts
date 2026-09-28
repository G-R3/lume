import { expect, it } from "vite-plus/test";
import type { LumeApi, MusicLibrary, PlaylistDetails, Track } from "../../shared/lib";
import { createPlaybackController } from "./playback-controller";
import type { PlaybackRequest } from "./playback-media";

it.each(["all-tracks", "playlist"] as const)(
  "resets an exhausted %s source paused after the manual queue finishes",
  async (source) => {
    const tracks = [{ ...track(1), available: false }, track(2), track(3), track(4)];

    const playback = createTestPlayback(() =>
      Promise.resolve({
        id: 1,
        title: "Source",
        description: null,
        tracks: tracks
          .slice(0, 3)
          .map((item, position) => ({ id: item.id + 10, trackId: item.id, position })),
      }),
    );

    playback.controller.syncLibrary({ kind: "library", sources: [], playlists: [], tracks });

    await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

    playback.controller.playFromSource(
      tracks.slice(0, 3).map((item) => ({
        sourceEntryId: source === "playlist" ? item.id + 10 : item.id,
        track: item,
      })),
      2,
      source === "playlist" ? 1 : undefined,
    );
    playback.controller.dispatch({ type: "enqueueTrack", trackId: 4 });

    expect(
      playback.controller.getSnapshot().queue?.manualQueue.map((item) => item.trackId),
    ).toEqual([4]);

    const lastSourceItem = playback.requests.at(-1);

    if (!lastSourceItem) throw new Error("Expected the source track to load");
    playback.controller.onAudioEvent({ type: "ended", queueItemId: lastSourceItem.queueItemId });

    expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(4);
    expect(playback.requests.at(-1)?.shouldPlay).toBe(true);

    const manualItem = playback.requests.at(-1);

    if (!manualItem) throw new Error("Expected the manual track to load");
    playback.controller.onAudioEvent({ type: "ended", queueItemId: manualItem.queueItemId });

    await expect.poll(() => playback.controller.getSnapshot().queue?.status).toBe("paused");

    expect(playback.controller.getSnapshot().queue?.current?.item.trackId).toBe(2);
    expect(playback.controller.getSnapshot().queue?.manualQueue).toEqual([]);

    expect(
      playback.controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId),
    ).toEqual(source === "playlist" ? [3] : [3, 4]);

    expect(playback.requests.at(-1)).toMatchObject({ position: 0, shouldPlay: false });
  },
);

it("does not replace a new selection when the finished playlist read resolves", async () => {
  let finishRead: ((playlist: PlaylistDetails | null) => void) | undefined;

  const pending = new Promise<PlaylistDetails | null>((resolve) => {
    finishRead = resolve;
  });

  const playback = createTestPlayback(() => pending);
  const tracks = [track(1), track(2)];

  playback.controller.syncLibrary({ kind: "library", sources: [], playlists: [], tracks });

  await expect.poll(() => playback.controller.getSnapshot().isInitialized).toBe(true);

  playback.controller.playFromSource([{ sourceEntryId: 10, track: tracks[0] }], 0, 1);
  playback.controller.dispatch({ type: "next", reason: "ended" });
  playback.controller.playFromSource([{ sourceEntryId: 2, track: tracks[1] }], 0);

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

  playback.controller.playFromSource([{ sourceEntryId: 1, track: track(1) }], 0);

  expect(playback.requests.at(-1)).toMatchObject({ url: "lume://track/1", shouldPlay: true });

  playback.controller.syncLibrary({
    kind: "library",
    sources: [],
    playlists: [],
    tracks: [{ ...track(1), available: false }],
  });

  playback.controller.dispatch({ type: "next", reason: "ended" });

  expect(playback.controller.getSnapshot().queue?.status).toBe("stopped");
  expect(playback.requests.at(-1)).toBeNull();
});

it("keeps the active source in order through playlist edits", async () => {
  const controller = createPlaybackController(
    {
      load: () => {},
      getPosition: () => 0,
      hasRequest: () => true,
      play: () => {},
      pause: () => {},
      seek: () => {},
    },
    {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      flush: () => {},
    },
    () => Promise.resolve(null),
  );

  const library = {
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
    sources: [],
    tracks: [track(1), track(2), track(3), track(4)],
  } satisfies MusicLibrary;

  controller.syncLibrary(library);
  await expect.poll(() => controller.getSnapshot().isInitialized).toBe(true);
  controller.playFromSource(
    library.tracks.slice(0, 3).map((item) => ({ sourceEntryId: item.id, track: item })),
    0,
    1,
  );

  controller.dispatch({ type: "sourceEntryRemoved", playlistId: 1, sourceEntryId: 2 });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  controller.dispatch({
    type: "sourceEntryAdded",
    playlistId: 1,
    entry: { sourceEntryId: 4, trackId: 4 },
  });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);

  controller.dispatch({ type: "sourceDeleted", playlistId: 1 });

  expect(controller.getSnapshot().queue?.source).toEqual({ kind: "detached", title: "Source" });
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(1);
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);
});

it("restarts the current track before navigating to the prior source item", async () => {
  let position = 0;

  const controller = createPlaybackController(
    {
      load: () => {},
      getPosition: () => position,
      hasRequest: () => true,
      play: () => {},
      pause: () => {},
      seek: (time) => {
        position = time;
      },
    },
    {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      flush: () => {},
    },
    () => Promise.resolve(null),
  );

  const tracks = [track(1), track(2), track(3)];
  controller.syncLibrary({ kind: "library", playlists: [], sources: [], tracks });
  await expect.poll(() => controller.getSnapshot().isInitialized).toBe(true);
  controller.playFromSource(
    tracks.map((item) => ({ sourceEntryId: item.id, track: item })),
    1,
  );

  position = 3;
  controller.previous();
  expect(position).toBe(0);
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(2);

  controller.previous();
  expect(controller.getSnapshot().queue?.current?.item.trackId).toBe(1);
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([2, 3]);
});

function createTestPlayback(loadPlaylist: LumeApi["loadPlaylist"] = () => Promise.resolve(null)) {
  const requests: (PlaybackRequest | null)[] = [];
  let position = 0;

  const controller = createPlaybackController(
    {
      load: (request, time = request?.position ?? 0) => {
        requests.push(request);
        position = time;
      },
      getPosition: () => position,
      hasRequest: () => !!requests.at(-1),
      play: () => {},
      pause: () => {},
      seek: (time) => {
        position = time;
      },
    },
    {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      flush: () => {},
    },
    loadPlaylist,
  );

  return { controller, requests };
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
