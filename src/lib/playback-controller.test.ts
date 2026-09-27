import { expect, it } from "vite-plus/test";
import type { MusicLibrary, Track } from "../../shared/lib";
import { createPlaybackController } from "./playback-controller";

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
  );

  const library = {
    kind: "library",
    playlists: [{ id: 1, title: "Source", description: null, trackCount: 3 }],
    sources: [],
    tracks: [track(1), track(2), track(3), track(4)],
  } satisfies MusicLibrary;

  controller.syncLibrary(library);
  await expect.poll(() => controller.getSnapshot().ready).toBe(true);
  controller.playFromSource(
    library.tracks.slice(0, 3).map((item) => ({ occurrenceId: item.id, track: item })),
    0,
    1,
  );

  controller.dispatch({ type: "sourceEntryRemoved", playlistId: 1, occurrenceId: 2 });
  expect(controller.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  controller.dispatch({
    type: "sourceEntryAdded",
    playlistId: 1,
    entry: { occurrenceId: 4, trackId: 4 },
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
  );

  const tracks = [track(1), track(2), track(3)];
  controller.syncLibrary({ kind: "library", playlists: [], sources: [], tracks });
  await expect.poll(() => controller.getSnapshot().ready).toBe(true);
  controller.playFromSource(
    tracks.map((item) => ({ occurrenceId: item.id, track: item })),
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
