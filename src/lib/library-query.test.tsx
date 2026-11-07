// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, StrictMode, type ReactNode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import {
  type AddTracksToPlaylistResult,
  getTrackUrl,
  type LibrarySnapshotJson,
  type LibrarySource,
  type LibraryUpdate,
  type MusicLibrary,
  type PlaylistDetails,
  stringifyLibrary,
  type Track,
  type TrackLikeResult,
  type TrackTuple,
} from "../../shared/lib";
import { AppRoot } from "@/App";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useLibraryMutation, useSetTracksLiked } from "@/lib/library-query";
import { useAddTracksToPlaylistMutation } from "@/lib/playlist-mutations";

vi.mock("@/hooks/use-playback", () => ({
  usePlayback: () => ({ applySourceChange: () => {} }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe("a pending like", () => {
  it("stays shown when a folder command queued ahead of it returns", async () => {
    const app = await startApp(stored({ likedAt: null }));
    const rescan = app.lume.rescanSources.next();
    await app.do.rescanSources();
    await vi.waitFor(() => expect(app.lume.rescanSources.calls).toHaveLength(1));

    await app.do.like(1);
    await app.shows(1, "liked");

    await app.answer(rescan, json(stored({ likedAt: null })));
    await app.answer(await app.lume.likes.call(0), [{ likedAt: 100, trackId: 1 }]);

    expect(app.historyOf(1)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(1)).toBe(100);
  });

  it("stays shown when the startup scan returns a library read before the write", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.do.like(1);
    await app.shows(1, "liked");
    const write = await app.lume.likes.call(0);

    await app.finishScan({
      kind: "snapshot",
      library: json(stored({ likedAt: null, title: "Scanned" })),
    });
    await app.answer(write, [{ likedAt: 100, trackId: 1 }]);

    expect(app.titleOf(1)).toBe("Scanned");
    expect(app.historyOf(1)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(1)).toBe(100);
  });

  it("stays shown when an older write for another track fails", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.do.like(1);
    const failing = await app.lume.likes.call(0);
    await app.do.like(2);
    await app.shows(2, "liked");

    await app.fail(failing, new Error("disk full"));
    await app.answer(await app.lume.likes.call(1), [{ likedAt: 200, trackId: 2 }]);

    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);
    expect(app.historyOf(2)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(2)).toBe(200);
  });

  it("keeps the newest intent for a track when an older write succeeds", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.do.like(1);
    const likeWrite = await app.lume.likes.call(0);
    await app.do.unlike(1);
    await app.shows(1, "unliked");

    await app.answer(likeWrite, [{ likedAt: 100, trackId: 1 }]);
    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);

    await app.answer(await app.lume.likes.call(1), [{ likedAt: null, trackId: 1 }]);
    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);
  });

  it("does not bring back a track that a newer library removed", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.do.like(1, 2);
    const write = await app.lume.likes.call(0);
    const withoutTrack2 = stored({ likedAt: null });
    await app.finishScan({
      kind: "snapshot",
      library: json({ ...withoutTrack2, tracks: withoutTrack2.tracks.slice(0, 1) }),
    });

    await app.answer(write, [
      { likedAt: 100, trackId: 1 },
      { likedAt: 100, trackId: 2 },
    ]);

    expect(app.likedAtOf(1)).toBe(100);
    expect(rowOf(2)).toBeNull();
  });
});

describe("a library read that overlaps a like", () => {
  it("still lands when the like starts while it is in flight", async () => {
    const app = await startApp(stored({ likedAt: null }));
    const added = app.lume.addTracks.next();
    await app.do.addToPlaylist(2);
    await app.answer(added, {
      kind: "added",
      tracks: [{ addedAt: 1, id: 9, position: 1, trackId: 2 }],
    });
    const refetch = await app.lume.loads.call(1);

    await app.do.like(1);
    await app.shows(1, "liked");

    await app.answer(refetch, json(stored({ likedAt: null, playlistTracks: 2 })));
    await app.answer(await app.lume.likes.call(0), [{ likedAt: 100, trackId: 1 }]);

    expect(app.playlistTrackCount()).toBe(2);
    expect(app.historyOf(1)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(1)).toBe(100);
  });
});

describe("after a failed write", () => {
  it("shows the stored like time, not another write's guess", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.do.like(1);
    await app.shows(1, "liked");
    const first = await app.lume.likes.call(0);
    await app.do.like(1, 2);

    await app.answer(first, [{ likedAt: 100, trackId: 1 }]);
    await app.fail(await app.lume.likes.call(1), new Error("disk full"));
    expect(app.likedAtOf(1)).toBe(100);
    expect(app.likedAtOf(2)).toBeNull();
  });
});

describe("startup", () => {
  it.each([{ strict: false }, { strict: true }])(
    "shows the first read when the scan finished before it, with one read (strict mode: $strict)",
    async ({ strict }) => {
      const app = await startApp(null, { strict });

      await app.finishScan({ kind: "sources", sources: [source({ lastScannedAt: 2 })] });
      await app.answer(app.lume.loads.calls[0], json(stored({ likedAt: null, scannedAt: 3 })));

      await vi.waitFor(() => expect(app.scannedAt()).toBe("3"));
      expect(app.lume.loads.calls).toHaveLength(1);
    },
  );

  it("patches only the folders when the scan finishes after the first read", async () => {
    const app = await startApp(stored({ likedAt: null }));

    await app.finishScan({ kind: "sources", sources: [source({ lastScannedAt: 2 })] });

    expect(app.scannedAt()).toBe("2");
    expect(probe.trackLists.size).toBe(1);
    expect(app.lume.loads.calls).toHaveLength(1);
  });

  it("rereads when the scan finishes after a failed first read", async () => {
    const app = await startApp(null);
    await app.fail(app.lume.loads.calls[0], new Error("locked"));
    expect(document.body.textContent).toContain("Lume could not load your library");

    await app.finishScan({ kind: "sources", sources: [source({ lastScannedAt: 2 })] });
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null })));

    await app.shows(1, "unliked");
  });

  it("rereads when the user tries again after a failed first read", async () => {
    const app = await startApp(null);
    await app.fail(app.lume.loads.calls[0], new Error("locked"));

    await step(() => findButton("Try again").click());
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null })));

    await app.shows(1, "unliked");
  });
});

type LikedState = "liked" | "unliked";

type Actions = {
  addToPlaylist: (trackId: number) => void;
  like: (...trackIds: number[]) => void;
  rescanSources: () => void;
  unlike: (...trackIds: number[]) => void;
};

type Probe = {
  actions?: Actions;
  history: Map<number, LikedState[]>;
  trackLists: Set<readonly Track[]>;
};

const probe: Probe = { history: new Map(), trackLists: new Set() };

function SyncProbe() {
  const library = useMusicLibrary();
  const setLiked = useSetTracksLiked();
  const command = useLibraryMutation();
  const addTracks = useAddTracksToPlaylistMutation();

  probe.actions = {
    addToPlaylist: (trackId) =>
      addTracks.mutate({ duplicates: "allow", playlistId: 1, trackIds: [trackId] }),
    like: (...trackIds) => setLiked.mutate({ liked: true, trackIds }),
    rescanSources: () => command.mutate({ kind: "rescan-sources" }),
    unlike: (...trackIds) => setLiked.mutate({ liked: false, trackIds }),
  };

  useLayoutEffect(() => {
    probe.trackLists.add(library.tracks);

    for (const track of library.tracks) {
      const history = probe.history.get(track.id) ?? [];
      const state = track.likedAt === null ? "unliked" : "liked";

      if (history.at(-1) !== state) history.push(state);
      probe.history.set(track.id, history);
    }
  });

  return (
    <>
      <ul>
        {library.tracks.map((track) => (
          <li data-liked-at={String(track.likedAt)} data-track={track.id} key={track.id}>
            {track.title} {track.likedAt === null ? "unliked" : "liked"}
          </li>
        ))}
      </ul>
      <p data-playlist-count>{library.playlists[0]?.trackCount}</p>
      <p data-scanned-at>{library.sources.map((entry) => entry.lastScannedAt).join(",")}</p>
    </>
  );
}

async function startApp(firstRead: MusicLibrary | null, { strict = false } = {}) {
  probe.history = new Map();
  probe.trackLists = new Set();
  const lume = createLume();
  const client = new QueryClient();
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  onTestFinished(() => act(() => root.unmount()));

  await act(async () => root.render(renderApp(client, strict)));

  const app = {
    answer: async <T,>(call: Deferred<T>, value: T) => {
      await act(async () => call.resolve(value));
      await flush();
    },
    do: {
      addToPlaylist: (trackId: number) => step(() => probe.actions?.addToPlaylist(trackId)),
      like: (...trackIds: number[]) => step(() => probe.actions?.like(...trackIds)),
      rescanSources: () => step(() => probe.actions?.rescanSources()),
      unlike: (...trackIds: number[]) => step(() => probe.actions?.unlike(...trackIds)),
    },
    fail: async (call: { reject: (error: Error) => void }, error: Error) => {
      await act(async () => call.reject(error));
      await flush();
    },
    historyOf: (trackId: number) => probe.history.get(trackId) ?? [],
    likedAtOf: (trackId: number) => {
      const likedAt = rowOf(trackId)?.dataset.likedAt;

      return likedAt === undefined || likedAt === "null" ? null : Number(likedAt);
    },
    lume,
    playlistTrackCount: () =>
      Number(document.querySelector<HTMLElement>("[data-playlist-count]")?.textContent),
    finishScan: async (update: LibraryUpdate) => {
      await act(async () => lume.finishScan(update));
      await flush();
    },
    scannedAt: () => document.querySelector<HTMLElement>("[data-scanned-at]")?.textContent,
    shows: (trackId: number, state: LikedState) =>
      vi.waitFor(() => expect(rowOf(trackId)?.textContent).toMatch(new RegExp(` ${state}$`))),
    titleOf: (trackId: number) => rowOf(trackId)?.textContent?.replace(/ (un)?liked$/, ""),
  };

  if (firstRead) {
    await app.answer(lume.loads.calls[0], json(firstRead));
    await app.shows(1, firstRead.tracks[0].likedAt === null ? "unliked" : "liked");
  }

  return app;
}

async function step(action: () => void) {
  await act(async () => action());
  await flush();
}

function flush() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 10)));
}

function findButton(name: string) {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === name,
  );

  if (!button) throw new Error(`No ${name} button`);

  return button;
}

function rowOf(trackId: number) {
  return document.querySelector<HTMLElement>(`[data-track="${trackId}"]`);
}

function createLume() {
  const scans = createCalls<LibraryUpdate | null>();
  const loads = createCalls<LibrarySnapshotJson>();
  const likes = createCalls<TrackLikeResult[]>();
  const rescanSources = createCalls<LibrarySnapshotJson>();
  const addTracks = createCalls<AddTracksToPlaylistResult>();
  const playlists = createCalls<PlaylistDetails | null>();

  Object.defineProperty(window, "lume", {
    configurable: true,
    value: {
      addTracksToPlaylist: addTracks.invoke,
      awaitStartupScan: scans.invoke,
      isMac: false,
      loadLibrary: loads.invoke,
      loadPlaylist: playlists.invoke,
      rescanSources: rescanSources.invoke,
      setTracksLiked: likes.invoke,
    },
  });

  return {
    addTracks,
    likes,
    loads,
    finishScan: (update: LibraryUpdate) => scans.calls.forEach((call) => call.resolve(update)),
    rescanSources,
  };
}

type Deferred<T> = ReturnType<typeof createDeferred<T>>;

function createCalls<T>() {
  const calls: Deferred<T>[] = [];
  let upcoming: Deferred<T> | undefined;

  return {
    call: (index: number) => vi.waitFor(() => calls[index] ?? Promise.reject(new Error("no call"))),
    calls,
    invoke: () => {
      const call = upcoming ?? createDeferred<T>();
      upcoming = undefined;
      calls.push(call);

      return call.promise;
    },
    next: () => {
      upcoming = createDeferred<T>();

      return upcoming;
    },
  };
}

function renderApp(client: QueryClient, strict: boolean) {
  const rootRoute = createRootRoute({ component: AppRoot });

  const libraryRoute = createRoute({
    component: SyncProbe,
    getParentRoute: () => rootRoute,
    path: "/",
  });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([libraryRoute]),
  });

  const app: ReactNode = (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return strict ? <StrictMode>{app}</StrictMode> : app;
}

function stored({
  likedAt,
  playlistTracks = 1,
  scannedAt = 1,
  title = "Song",
}: {
  likedAt: number | null;
  playlistTracks?: number;
  scannedAt?: number;
  title?: string;
}): MusicLibrary {
  return {
    kind: "library",
    playlists: [{ description: null, id: 1, title: "Mix", trackCount: playlistTracks }],
    sources: [source({ lastScannedAt: scannedAt })],
    tracks: [
      { ...track(1), likedAt, title },
      { ...track(2), title },
    ],
  };
}

function source({ lastScannedAt }: { lastScannedAt: number }): LibrarySource {
  return { enabled: true, id: 1, lastScanError: null, lastScannedAt, path: "/music", trackCount: 2 };
}

function json(library: MusicLibrary) {
  return stringifyLibrary(library.playlists, library.sources, library.tracks.map(tupleOf));
}

function tupleOf(track: Track): TrackTuple {
  return [
    track.addedAt,
    track.album,
    track.albumArtists,
    track.artists,
    track.artworkUrl,
    track.available,
    track.bitrate,
    track.bitsPerSample,
    track.channelCount,
    track.codec,
    track.discNumber,
    track.discTotal,
    track.duration,
    track.format,
    track.genres,
    track.id,
    track.likedAt,
    track.lossless,
    track.title,
    track.sampleRate,
    track.trackNumber,
    track.trackTotal,
    track.year,
  ];
}

function track(id: number): Track {
  return {
    addedAt: 1,
    album: "Album",
    albumArtists: ["Artist"],
    artists: ["Artist"],
    artworkUrl: null,
    available: true,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 1,
    format: "MP3",
    genres: ["Pop"],
    id,
    likedAt: null,
    lossless: null,
    sampleRate: null,
    title: "Song",
    trackNumber: id,
    trackTotal: null,
    url: getTrackUrl(id),
    year: null,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
