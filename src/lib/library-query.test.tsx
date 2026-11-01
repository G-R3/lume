// @vitest-environment happy-dom

import {
  MutationObserver,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import {
  type LibrarySnapshot,
  type LibrarySnapshotJson,
  type LibrarySource,
  type LibraryUpdate,
  type LumeApi,
  type MusicLibrary,
  type TrackTuple,
  createBufferedListeners,
  stringifyLibrary,
  getTrackUrl,
  stringifyFirstRunLibrary,
  type SetTracksLikedInput,
  type Track,
  type TrackLikeResult,
} from "../../shared/lib";
import { AppRoot } from "@/App";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { applyLibraryUpdate, libraryQueryOptions, setTracksLikedMutation } from "./library-query";

const libraryKey = libraryQueryOptions.queryKey;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe("library updates", () => {
  it("replaces the library with a snapshot push", async () => {
    const lume = createLume();
    const client = observedClient();
    lume.respond(0, library([source(1)]));
    await settle(client);
    const pushed: MusicLibrary = { ...library([source(2)]), playlists: [], tracks: [track(3)] };

    applyLibraryUpdate(client, { kind: "snapshot", library: json(pushed) });

    expect(libraryOf(client)).toEqual(pushed);
    expect(lume.loads).toHaveLength(1);
  });

  it("patches only the sources once the library is loaded", async () => {
    const lume = createLume();
    const client = observedClient();
    lume.respond(0, library([source(1)]));
    await settle(client);
    const before = libraryOf(client);

    applyLibraryUpdate(client, { kind: "sources", sources: [source(2)] });

    const after = libraryOf(client);
    expect(after.sources).toEqual([source(2)]);
    expect(after.tracks).toBe(before.tracks);
    expect(after.playlists).toBe(before.playlists);
    expect(lume.loads).toHaveLength(1);
  });

  it("applies a push received during the first load to that load's result", async () => {
    const lume = createLume();
    const client = observedClient();

    applyLibraryUpdate(client, { kind: "sources", sources: [source(2)] });
    expect(client.getQueryData(libraryKey)).toBeUndefined();
    lume.respond(0, library([source(1)]));
    await settle(client);

    expect(libraryOf(client)).toEqual(library([source(2)]));
    expect(lume.loads).toHaveLength(1);
  });

  it("drops the push with a failed first load, and the retry uses its own read", async () => {
    const lume = createLume();
    const client = new QueryClient();
    const observer = observe(client);
    applyLibraryUpdate(client, { kind: "sources", sources: [source(2)] });
    lume.loads[0].reject(new Error("read failed"));
    await settle(client);
    expect(client.getQueryState(libraryKey)?.status).toBe("error");

    void observer.refetch();
    lume.respond(1, library([source(3)]));
    await settle(client);

    expect(libraryOf(client).sources).toEqual([source(3)]);
  });

  it("lets a refetch with data replace a push that arrived during it", async () => {
    const lume = createLume();
    const client = observedClient();
    lume.respond(0, library([source(1), source(1, 2)]));
    await settle(client);

    void client.invalidateQueries({ queryKey: libraryKey });
    applyLibraryUpdate(client, { kind: "sources", sources: [source(2), source(2, 2)] });
    lume.respond(1, library([source(1)]));
    await settle(client);

    expect(libraryOf(client).sources).toEqual([source(1)]);
  });

  it("reads the library again when a push meets a failed first load", async () => {
    const lume = createLume();
    const client = observedClient();
    lume.loads[0].reject(new Error("read failed"));
    await settle(client);

    applyLibraryUpdate(client, { kind: "sources", sources: [source(2)] });
    expect(lume.loads).toHaveLength(2);
    lume.respond(1, library([source(2)]));
    await settle(client);

    expect(libraryOf(client).sources).toEqual([source(2)]);
  });
});

describe("track likes", () => {
  it("rolls back only the tracks a failed write still owns, then rereads the library", async () => {
    const { client, lume, writes } = await likedLibrary([liked(1, 5), liked(2, 5)]);

    const unlikeBoth = like(client, { liked: false, trackIds: [1, 2] });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    void like(client, { liked: true, trackIds: [2] });
    await vi.waitFor(() => expect(likedAtOf(client, 2)).not.toBeNull());
    const newerIntent = likedAtOf(client, 2);

    writes[0].reject(new Error("write failed"));
    await expect(unlikeBoth).rejects.toThrow("write failed");

    expect(likedAtOf(client, 1)).toBe(5);
    expect(likedAtOf(client, 2)).toBe(newerIntent);
    expect(lume.loads).toHaveLength(2);
  });

  it("keeps a newer intent for the same track when an older write succeeds", async () => {
    const { client, writes } = await likedLibrary([track(1)]);

    const likeTrack = like(client, { liked: true, trackIds: [1] });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const unlikeTrack = like(client, { liked: false, trackIds: [1] });
    await vi.waitFor(() => expect(likedAtOf(client, 1)).toBeNull());

    writes[0].resolve([{ likedAt: 100, trackId: 1 }]);
    await likeTrack;
    expect(likedAtOf(client, 1)).toBeNull();

    await vi.waitFor(() => expect(writes).toHaveLength(2));
    writes[1].resolve([{ likedAt: null, trackId: 1 }]);
    await unlikeTrack;
    expect(likedAtOf(client, 1)).toBeNull();
  });

  it("applies the stored time without bringing back a track removed meanwhile", async () => {
    const { client, writes } = await likedLibrary([track(1), track(2), track(3)]);

    const likeTracks = like(client, { liked: true, trackIds: [1, 2] });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const [first, , third] = libraryOf(client).tracks;
    applyLibraryUpdate(client, {
      kind: "snapshot",
      library: json({ ...library([source(1)]), tracks: [first, third] }),
    });

    writes[0].resolve([
      { likedAt: 100, trackId: 1 },
      { likedAt: 100, trackId: 2 },
    ]);
    await likeTracks;

    expect(libraryOf(client).tracks.map(({ id, likedAt }) => ({ id, likedAt }))).toEqual([
      { id: 1, likedAt: 100 },
      { id: 3, likedAt: null },
    ]);
  });
});

async function likedLibrary(tracks: Track[]) {
  const lume = createLume();
  const writes: ReturnType<typeof createDeferred<TrackLikeResult[]>>[] = [];

  Object.assign(window.lume, {
    setTracksLiked: () => {
      const write = createDeferred<TrackLikeResult[]>();
      writes.push(write);

      return write.promise;
    },
  });

  const client = observedClient();
  lume.respond(0, { ...library([source(1)]), tracks });
  await settle(client);

  return { client, lume, writes };
}

function like(client: QueryClient, input: SetTracksLikedInput) {
  return new MutationObserver(client, setTracksLikedMutation(client)).mutate(input);
}

function likedAtOf(client: QueryClient, trackId: number) {
  return libraryOf(client).tracks.find((entry) => entry.id === trackId)?.likedAt;
}

function liked(id: number, likedAt: number): Track {
  return { ...track(id), likedAt };
}

describe("app startup order", () => {
  it.each([{ strict: false }, { strict: true }])(
    "applies a push sent before the app listens to the first load (strict mode: $strict)",
    async ({ strict }) => {
      const lume = createLume();
      lume.push({ kind: "sources", sources: [source(2)] });
      const client = new QueryClient();
      const root = createRoot(document.body.appendChild(document.createElement("div")));
      onTestFinished(() => act(() => root.unmount()));

      await act(async () => root.render(renderApp(client, strict)));
      await act(async () => lume.respond(0, library([source(1)])));

      await vi.waitFor(() => expect(document.body.textContent).toContain("sources 1:2"));
      expect(lume.loads).toHaveLength(1);
    },
  );
});

function createLume() {
  const loads: ReturnType<typeof createDeferred<LibrarySnapshotJson>>[] = [];
  const updates = createBufferedListeners<LibraryUpdate>();

  const lume: Pick<LumeApi, "isMac" | "loadLibrary" | "onLibraryUpdate"> = {
    isMac: false,
    loadLibrary: () => {
      const load = createDeferred<LibrarySnapshotJson>();
      loads.push(load);

      return load.promise;
    },
    onLibraryUpdate: updates.subscribe,
  };

  Object.defineProperty(window, "lume", { configurable: true, value: lume });

  return {
    loads,
    push: updates.publish,
    respond: (index: number, snapshot: LibrarySnapshot) => loads[index].resolve(json(snapshot)),
  };
}

function observe(client: QueryClient) {
  const observer = new QueryObserver(client, libraryQueryOptions);
  onTestFinished(observer.subscribe(() => {}));

  return observer;
}

function observedClient() {
  const client = new QueryClient();
  observe(client);

  return client;
}

async function settle(client: QueryClient) {
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
}

function libraryOf(client: QueryClient) {
  const data = client.getQueryData(libraryKey);

  if (data?.kind !== "library") throw new Error("Expected a loaded library");

  return data;
}

function renderApp(client: QueryClient, strict: boolean) {
  const rootRoute = createRootRoute({ component: AppRoot });

  const libraryRoute = createRoute({
    component: SourcesProbe,
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

function SourcesProbe() {
  const library = useMusicLibrary();

  return (
    <p>
      sources{" "}
      {library.sources.map((entry) => `${entry.id}:${String(entry.lastScannedAt)}`).join(",")}
    </p>
  );
}

function json(snapshot: LibrarySnapshot) {
  if (snapshot.kind === "first-run") return stringifyFirstRunLibrary();

  return stringifyLibrary(
    snapshot.playlists,
    snapshot.sources,
    snapshot.tracks.map(trackTupleFromTrack),
  );
}

function trackTupleFromTrack(track: Track): TrackTuple {
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

function library(sources: LibrarySource[]): MusicLibrary {
  return {
    kind: "library",
    playlists: [{ description: null, id: 1, title: "Mix", trackCount: 1 }],
    sources,
    tracks: [track(1), track(2)],
  };
}

function source(lastScannedAt: number, id = 1): LibrarySource {
  return {
    enabled: true,
    id,
    lastScanError: null,
    lastScannedAt,
    path: `/music/${id}`,
    trackCount: 2,
  };
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
    title: `Song ${id}`,
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
