import { expect, it } from "vite-plus/test";
import type { MusicLibrary, Track } from "../../shared/lib";
import { createPlaybackCoordinator } from "./playback-coordinator";

it("keeps the active source in order through playlist edits", async () => {
  const coordinator = createPlaybackCoordinator(
    { load: () => {}, getPosition: () => 0 },
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

  coordinator.syncLibrary(library);
  await expect.poll(() => coordinator.getSnapshot().ready).toBe(true);
  coordinator.dispatch({
    type: "startFromSource",
    source: { kind: "playlist", playlistId: 1, title: "Source" },
    occurrences: [1, 2, 3].map((trackId) => ({ occurrenceId: trackId, trackId })),
    atOccurrenceId: 1,
  });

  coordinator.dispatch({ type: "sourceEntryRemoved", playlistId: 1, occurrenceId: 2 });
  expect(coordinator.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3]);

  coordinator.dispatch({
    type: "sourceEntryAdded",
    playlistId: 1,
    entry: { occurrenceId: 4, trackId: 4 },
  });
  expect(coordinator.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);

  coordinator.dispatch({ type: "sourceDeleted", playlistId: 1 });

  expect(coordinator.getSnapshot().queue?.source).toEqual({ kind: "detached", title: "Source" });
  expect(coordinator.getSnapshot().queue?.current?.item.trackId).toBe(1);
  expect(coordinator.getSnapshot().queue?.sourceQueue.map((item) => item.trackId)).toEqual([3, 4]);
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
