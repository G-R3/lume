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
  type PlaylistAdditionResult,
  type PlaylistCreationResult,
  type PlaylistDetails,
  type PlaylistEvent,
  type PlaylistRead,
  type LibraryEvent,
  type LibraryRevision,
  type LibrarySource,
  type LibraryState,
  type MusicLibrary,
  type ScanFrame,
  type Track,
  type TracksLikedResult,
} from "../../shared/library";
import { getTrackUrl } from "../../shared/app-urls";
import {
  type LibrarySnapshotJson,
  stringifyLibrary,
  type TrackTuple,
} from "../../shared/library-json";
import { AppRoot } from "@/App";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useLibraryMutation, useScanningSources, useSetTracksLiked } from "@/lib/library-query";
import {
  useAddTracksToPlaylistMutation,
  useCreatePlaylistMutation,
} from "@/lib/playlist-mutations";
import type { PlaylistSourceChange } from "@/lib/playlist-events";
import { usePlaylist } from "@/lib/playlist-query";

const queue = vi.hoisted(() => {
  const changes: [PlaylistSourceChange, LibraryRevision][] = [];

  return {
    changes,
    applySourceChange: (change: PlaylistSourceChange, revision: LibraryRevision) =>
      changes.push([change, revision]),
  };
});

vi.mock("@/hooks/use-playback", () => ({
  usePlayback: () => ({ applySourceChange: queue.applySourceChange }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe("a pending like", () => {
  it("stays shown when a read for an earlier change lands before the write", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    await app.shows(1, "liked");
    await app.push(changed(2));
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null, revision: 2 })));
    await app.answer(await app.lume.likes.call(0), liked(3, [1, 100]));

    expect(app.historyOf(1)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(1)).toBe(100);
  });

  it("keeps the same track object when another track is liked", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    await app.shows(1, "liked");
    const pendingTrack = app.trackOf(1);
    await app.do.like(2);
    await app.shows(2, "liked");

    expect(app.trackOf(1)).toBe(pendingTrack);
  });

  it("stays shown when an older write for another track fails", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    const failing = await app.lume.likes.call(0);
    await app.do.like(2);
    await app.shows(2, "liked");

    await app.fail(failing, new Error("disk full"));
    await app.answer(await app.lume.likes.call(1), liked(2, [2, 200]));

    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);
    expect(app.historyOf(2)).toEqual(["unliked", "liked"]);
    expect(app.likedAtOf(2)).toBe(200);
  });

  it("keeps the newest intent for a track when an older write succeeds", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    const likeWrite = await app.lume.likes.call(0);
    await app.do.unlike(1);
    await app.shows(1, "unliked");

    await app.answer(likeWrite, liked(2, [1, 100]));
    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);

    await app.answer(await app.lume.likes.call(1), liked(3, [1, null]));
    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);
  });

  it("is saved before a later like for the same track starts", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    const likeWrite = await app.lume.likes.call(0);
    await app.do.unlike(1);
    await app.shows(1, "unliked");
    expect(app.lume.likes.calls).toHaveLength(1);

    await app.answer(likeWrite, liked(2, [1, 100]));
    await app.answer(await app.lume.likes.call(1), liked(3, [1, null]));

    expect(app.historyOf(1)).toEqual(["unliked", "liked", "unliked"]);
  });

  it("does not bring back a track that a newer library removed", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1, 2);
    const write = await app.lume.likes.call(0);
    const withoutTrack2 = stored({ likedAt: null, revision: 2 });
    await app.push(changed(2));
    await app.answer(
      await app.lume.loads.call(1),
      json({ ...withoutTrack2, tracks: withoutTrack2.tracks.slice(0, 1) }),
    );

    await app.answer(write, liked(3, [1, 100], [2, 100]));

    expect(app.likedAtOf(1)).toBe(100);
    expect(rowOf(2)).toBeNull();
  });
});

describe("a saved like", () => {
  it("shows without rereading the library when it directly follows the shown one", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    await app.answer(await app.lume.likes.call(0), liked(2, [1, 100]));
    await app.push({ kind: "tracks-liked", likes: [{ likedAt: 100, trackId: 1 }], revision: 2 });

    expect(app.likedAtOf(1)).toBe(100);
    expect(app.lume.loads.calls).toHaveLength(1);
  });

  it("rereads the library when another change came before it", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.like(1);
    await app.answer(await app.lume.likes.call(0), liked(3, [1, 100]));
    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: 100, revision: 3, title: "Rescanned" })),
    );

    expect(app.titleOf(1)).toBe("Rescanned");
    expect(app.historyOf(1)).toEqual(["unliked", "liked"]);
  });

  it("shows a like that main pushed from elsewhere", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push({ kind: "tracks-liked", likes: [{ likedAt: 50, trackId: 2 }], revision: 2 });

    expect(app.likedAtOf(2)).toBe(50);
    expect(app.lume.loads.calls).toHaveLength(1);
  });

  it("lands after a read that was already running for an earlier change", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push(changed(2));
    const earlierRead = await app.lume.loads.call(1);
    await app.push({ kind: "tracks-liked", likes: [{ likedAt: 50, trackId: 1 }], revision: 3 });
    await app.answer(earlierRead, json(stored({ likedAt: null, revision: 2, title: "Renamed" })));
    await app.answer(await app.lume.loads.call(2), json(stored({ likedAt: 50, revision: 3 })));

    expect(app.likedAtOf(1)).toBe(50);
    expect(app.lume.loads.calls).toHaveLength(3);
  });
});

describe("a playlist edit", () => {
  it("shows in the sidebar, the open playlist and the queue without a read", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    await app.answer(await app.lume.playlists.call(0), mixRead(1, [entry(8, 1)]));

    await app.do.addToPlaylist(2);
    await app.push(added(2, [entry(9, 2)], 2));
    await app.answer(await app.lume.addTracks.call(0), {
      kind: "added",
      revision: 2,
      tracks: [entry(9, 2)],
    });

    expect(app.playlistTrackCount()).toBe(2);
    expect(app.playlistEntries()).toBe("8,9");
    expect(queue.changes).toEqual([
      [
        { type: "sourceEntriesAdded", playlistId: 1, entries: [{ sourceEntryId: 9, trackId: 2 }] },
        2,
      ],
    ]);
    expect(app.playlistPending()).toBe(false);
    expect(app.lume.loads.calls).toHaveLength(1);
    expect(app.lume.playlists.calls).toHaveLength(1);
  });

  it("stays pending until the library shows a playlist whose reply came first", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    const mix = { description: null, id: 2, title: "New", tracks: [entry(7, 1)] };

    await app.do.createPlaylist();
    await app.answer(await app.lume.creates.call(0), { playlist: mix, revision: 2 });

    expect(app.playlistPending()).toBe(true);

    await app.push({ kind: "playlist-created", playlist: mix, revision: 2 });

    expect(app.playlistPending()).toBe(false);
    expect(app.createdPlaylistShown()).toBe(true);
    expect(app.lume.loads.calls).toHaveLength(1);
  });

  it("reads the library once when the edit follows a change it has not read", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    await app.answer(await app.lume.playlists.call(0), mixRead(1, [entry(8, 1)]));

    await app.push(changed(2));
    await app.push(added(3, [entry(9, 2)], 2));

    expect(app.playlistEntries()).toBe("8,9");
    expect(queue.changes).toHaveLength(1);

    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: null, playlistTracks: 2, revision: 3 })),
    );

    expect(app.playlistTrackCount()).toBe(2);
    expect(app.lume.loads.calls).toHaveLength(2);
    expect(app.lume.playlists.calls).toHaveLength(1);
  });

  it("settles only after the open playlist shows an edit whose reply came first", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    await app.answer(await app.lume.playlists.call(0), mixRead(1, [entry(8, 1)]));
    let shownWhenSettled: string | undefined;

    await app.do.addToPlaylist(2, () => {
      shownWhenSettled = app.playlistEntries();
    });
    await app.answer(await app.lume.addTracks.call(0), {
      kind: "added",
      revision: 2,
      tracks: [entry(9, 2)],
    });
    await app.push(added(2, [entry(9, 2)], 2));

    expect(shownWhenSettled).toBe("8,9");
  });

  it("keeps an edit that lands while the open playlist is still loading", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    const staleRead = await app.lume.playlists.call(0);

    await app.push(added(2, [entry(9, 2)], 2));
    await app.answer(staleRead, mixRead(1, [entry(8, 1)]));
    await app.answer(await app.lume.playlists.call(1), mixRead(2, [entry(8, 1), entry(9, 2)]));

    expect(app.playlistEntries()).toBe("8,9");
  });

  it("keeps a newer read of the open playlist when its creation arrives late", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 3 }));
    await app.answer(await app.lume.playlists.call(0), mixRead(3, [entry(8, 1)]));

    await app.push({
      kind: "playlist-created",
      playlist: { description: null, id: 1, title: "Mix", tracks: [entry(8, 1), entry(9, 2)] },
      revision: 2,
    });

    expect(app.playlistEntries()).toBe("8");
  });

  it("keeps a deletion that lands while the open playlist is still loading", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));
    const staleRead = await app.lume.playlists.call(0);

    await app.push({ kind: "playlist-deleted", playlistId: 1, revision: 2 });
    await app.answer(staleRead, mixRead(1, [entry(8, 1)]));

    expect(app.playlistDeleted()).toBe(true);
  });
});

describe("startup", () => {
  it.each([{ strict: false }, { strict: true }])(
    "reads the library once when main has nothing newer (strict mode: $strict)",
    async ({ strict }) => {
      const app = await startApp(stored({ likedAt: null, revision: 1 }), { strict });

      expect(app.lume.loads.calls).toHaveLength(1);
      expect(app.lume.listeners()).toBe(1);
    },
  );

  it("reads again when main committed after the first read", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }), { stateRevision: 2 });

    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: null, revision: 2, title: "Scanned" })),
    );

    expect(app.titleOf(1)).toBe("Scanned");
    expect(app.lume.loads.calls).toHaveLength(2);
  });

  it("reads again when a change is pushed before the first read lands", async () => {
    const app = await startApp(null);

    await app.push(changed(2));
    await app.answer(app.lume.loads.calls[0], json(stored({ likedAt: null, revision: 1 })));
    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: null, revision: 2, title: "Scanned" })),
    );

    expect(app.titleOf(1)).toBe("Scanned");
    expect(app.lume.loads.calls).toHaveLength(2);
  });

  it("rereads when a change is pushed after a failed first read", async () => {
    const app = await startApp(null);
    await app.fail(app.lume.loads.calls[0], new Error("locked"));
    expect(document.body.textContent).toContain("Lume could not load your library");

    await app.push(changed(2));
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null, revision: 2 })));

    await app.shows(1, "unliked");
  });

  it("rereads when the user tries again after a failed first read", async () => {
    const app = await startApp(null);
    await app.fail(app.lume.loads.calls[0], new Error("locked"));

    await step(() => findButton("Try again").click());
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null, revision: 2 })));

    await app.shows(1, "unliked");
  });
});

describe("a folder command", () => {
  it("stays pending until the library shows the revision main returned", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1, title: "Off" }));

    await app.do.enableSource(1);
    await app.answer(await app.lume.commands.call(0), 2);
    expect(app.commandPending()).toBe(true);

    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: null, revision: 2, title: "On" })),
    );

    expect(app.titleOf(1)).toBe("On");
    expect(app.commandPending()).toBe(false);
  });

  it("settles without a read when it committed nothing new", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.do.rescanSources();
    await app.answer(await app.lume.commands.call(0), 1);

    expect(app.commandPending()).toBe(false);
    expect(app.lume.loads.calls).toHaveLength(1);
  });
});

describe("scanning folders", () => {
  it("shows the folders main reports when the app starts", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }), {
      scanning: [1],
    });

    expect(app.scanning()).toBe("1");
  });

  it("keeps a finished scan shown until the library holds what it committed", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push({ kind: "scans", scans: frame(2, 1, [1]) });
    expect(app.scanning()).toBe("1");

    await app.push(changed(2));
    await app.push({ kind: "scans", scans: frame(3, 2, []) });
    expect(app.scanning()).toBe("1");

    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null, revision: 2 })));
    expect(app.scanning()).toBe("");
  });

  it("shows each folder done once the library holds that folder's tracks", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }), { scanning: [1, 2] });

    await app.push(changed(2));
    await app.push({ kind: "scans", scans: frame(2, 2, [2]) });
    await app.push(changed(3));
    await app.push({ kind: "scans", scans: frame(3, 3, []) });
    await app.answer(await app.lume.loads.call(1), json(stored({ likedAt: null, revision: 2 })));
    expect(app.scanning()).toBe("2");

    await app.answer(await app.lume.loads.call(2), json(stored({ likedAt: null, revision: 3 })));
    expect(app.scanning()).toBe("");
  });

  it("finishes a scan whose library read failed once main's next read succeeds", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push({ kind: "scans", scans: frame(2, 1, [1]) });
    await app.push(changed(2));
    await app.push({ kind: "scans", scans: frame(3, 2, []) });
    await app.fail(await app.lume.loads.call(1), new Error("database is locked"));
    expect(app.scanning()).toBe("1");

    await app.answer(
      await app.lume.loads.call(2),
      json(stored({ likedAt: null, revision: 2, title: "Scanned" })),
    );

    expect(app.titleOf(1)).toBe("Scanned");
    expect(app.scanning()).toBe("");
  });

  it("shows a new folder scanning when its read arrives before the scan frame", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push(changed(2));
    await app.answer(
      await app.lume.loads.call(1),
      json(stored({ likedAt: null, revision: 2 }), frame(2, 2, [1])),
    );

    expect(app.scanning()).toBe("1");
  });

  it("ignores a frame older than the one it shows", async () => {
    const app = await startApp(stored({ likedAt: null, revision: 1 }));

    await app.push({ kind: "scans", scans: frame(3, 1, [1]) });
    await app.push({ kind: "scans", scans: frame(2, 1, []) });

    expect(app.scanning()).toBe("1");
  });
});

type LikedState = "liked" | "unliked";

type Actions = {
  addToPlaylist: (trackId: number, onSuccess?: () => void) => void;
  createPlaylist: () => void;
  enableSource: (sourceId: number) => void;
  like: (...trackIds: number[]) => void;
  rescanSources: () => void;
  unlike: (...trackIds: number[]) => void;
};

type Probe = {
  actions?: Actions;
  history: Map<number, LikedState[]>;
  tracks: Map<number, Track>;
};

const probe: Probe = { history: new Map(), tracks: new Map() };

function SyncProbe() {
  const library = useMusicLibrary();
  const scanning = useScanningSources();
  const setLiked = useSetTracksLiked();
  const command = useLibraryMutation();
  const addTracks = useAddTracksToPlaylistMutation();
  const createPlaylist = useCreatePlaylistMutation();
  const playlist = usePlaylist(1);

  probe.actions = {
    addToPlaylist: (trackId, onSuccess) =>
      addTracks.mutate({ duplicates: "allow", playlistId: 1, trackIds: [trackId] }, { onSuccess }),
    createPlaylist: () => createPlaylist.mutate({ description: null, title: "New", trackIds: [1] }),
    enableSource: (sourceId) =>
      command.mutate({ enabled: true, kind: "set-source-enabled", sourceId }),
    like: (...trackIds) => setLiked.mutate({ liked: true, trackIds }),
    rescanSources: () => command.mutate({ kind: "rescan-sources" }),
    unlike: (...trackIds) => setLiked.mutate({ liked: false, trackIds }),
  };

  useLayoutEffect(() => {
    for (const track of library.tracks) {
      const history = probe.history.get(track.id) ?? [];
      const state = track.likedAt === null ? "unliked" : "liked";

      if (history.at(-1) !== state) history.push(state);
      probe.history.set(track.id, history);
      probe.tracks.set(track.id, track);
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
      <p data-playlist-titles>{library.playlists.map((summary) => summary.title).join(",")}</p>
      <p data-playlist-entries>
        {playlist.data === null ? "deleted" : playlist.data?.tracks.map((track) => track.id).join(",")}
      </p>
      <p data-playlist-pending>{String(addTracks.isPending || createPlaylist.isPending)}</p>
      <p data-command-pending>{String(command.isPending)}</p>
      <p data-scanning>{[...scanning].join(",")}</p>
    </>
  );
}

async function startApp(
  firstRead: StoredLibrary | null,
  {
    scanning = [],
    stateRevision,
    strict = false,
  }: { scanning?: number[]; stateRevision?: LibraryRevision; strict?: boolean } = {},
) {
  probe.history = new Map();
  probe.tracks = new Map();
  queue.changes.length = 0;
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
    commandPending: () =>
      document.querySelector<HTMLElement>("[data-command-pending]")?.textContent === "true",
    do: {
      addToPlaylist: (trackId: number, onSuccess?: () => void) =>
        step(() => probe.actions?.addToPlaylist(trackId, onSuccess)),
      createPlaylist: () => step(() => probe.actions?.createPlaylist()),
      enableSource: (sourceId: number) => step(() => probe.actions?.enableSource(sourceId)),
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
    createdPlaylistShown: () => text("[data-playlist-titles]") === "Mix,New",
    playlistDeleted: () => text("[data-playlist-entries]") === "deleted",
    playlistEntries: () => text("[data-playlist-entries]"),
    playlistPending: () => text("[data-playlist-pending]") === "true",
    playlistTrackCount: () =>
      Number(document.querySelector<HTMLElement>("[data-playlist-count]")?.textContent),
    push: async (event: LibraryEvent) => {
      await act(async () => lume.push(event));
      await flush();
    },
    scanning: () => document.querySelector<HTMLElement>("[data-scanning]")?.textContent,
    shows: (trackId: number, state: LikedState) =>
      vi.waitFor(() => expect(rowOf(trackId)?.textContent).toMatch(new RegExp(` ${state}$`))),
    titleOf: (trackId: number) => rowOf(trackId)?.textContent?.replace(/ (un)?liked$/, ""),
    trackOf: (trackId: number) => probe.tracks.get(trackId),
  };

  if (firstRead) {
    const revision = stateRevision ?? firstRead.revision;
    await app.answer(lume.loads.calls[0], json(firstRead));

    for (const call of lume.states.calls) {
      await app.answer(call, { revision, scans: frame(1, firstRead.revision, scanning) });
    }

    if (revision === firstRead.revision) {
      await app.shows(1, firstRead.tracks[0].likedAt === null ? "unliked" : "liked");
    }
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

function text(selector: string) {
  return document.querySelector<HTMLElement>(selector)?.textContent;
}

function rowOf(trackId: number) {
  return document.querySelector<HTMLElement>(`[data-track="${trackId}"]`);
}

function createLume() {
  const loads = createCalls<LibrarySnapshotJson>();
  const states = createCalls<LibraryState>();
  const likes = createCalls<TracksLikedResult>();
  const commands = createCalls<LibraryRevision>();
  const addTracks = createCalls<PlaylistAdditionResult>();
  const creates = createCalls<PlaylistCreationResult>();
  const playlists = createCalls<PlaylistRead>();
  const listeners = new Set<(event: LibraryEvent) => void>();

  Object.defineProperty(window, "lume", {
    configurable: true,
    value: {
      addTracksToPlaylist: addTracks.invoke,
      createPlaylist: creates.invoke,
      enableSource: commands.invoke,
      isMac: false,
      loadPlaylist: playlists.invoke,
      loadLibrary: loads.invoke,
      loadLibraryState: states.invoke,
      onLibraryEvent: (listener: (event: LibraryEvent) => void) => {
        listeners.add(listener);

        return () => listeners.delete(listener);
      },
      rescanSources: commands.invoke,
      setTracksLiked: likes.invoke,
    },
  });

  return {
    addTracks,
    commands,
    creates,
    playlists,
    likes,
    listeners: () => listeners.size,
    loads,
    push: (event: LibraryEvent) => listeners.forEach((listener) => listener(event)),
    states,
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
  revision,
  scannedAt = 1,
  title = "Song",
}: {
  likedAt: number | null;
  playlistTracks?: number;
  revision: LibraryRevision;
  scannedAt?: number;
  title?: string;
}): StoredLibrary {
  return {
    kind: "library",
    playlists: [{ description: null, id: 1, title: "Mix", trackCount: playlistTracks }],
    revision,
    sources: [source({ lastScannedAt: scannedAt })],
    tracks: [
      { ...track(1), likedAt, title },
      { ...track(2), title },
    ],
  };
}

function source({ lastScannedAt }: { lastScannedAt: number }): LibrarySource {
  return {
    id: 1,
    path: "/music",
    status: { kind: "scanned", scannedAt: lastScannedAt, trackCount: 2 },
  };
}

type StoredLibrary = MusicLibrary & { revision: LibraryRevision };

function json(library: StoredLibrary, scans = frame(0, 0, [])) {
  return stringifyLibrary(
    { revision: library.revision, scans },
    library.playlists,
    library.sources,
    library.tracks.map(tupleOf),
  );
}

function entry(id: number, trackId: number) {
  return { addedAt: 1, id, position: id, trackId };
}

function mixRead(revision: LibraryRevision, tracks: PlaylistDetails["tracks"]): PlaylistRead {
  return { playlist: { description: null, id: 1, title: "Mix", tracks }, revision };
}

function added(
  revision: LibraryRevision,
  tracks: PlaylistDetails["tracks"],
  trackCount: number,
): PlaylistEvent {
  return { kind: "playlist-tracks-added", playlistId: 1, revision, trackCount, tracks };
}

function changed(revision: LibraryRevision): LibraryEvent {
  return { kind: "changed", revision };
}

function frame(sequence: number, afterRevision: LibraryRevision, scanning: number[]): ScanFrame {
  return { afterRevision, scanning, sequence };
}

function liked(
  revision: LibraryRevision,
  ...likes: [trackId: number, likedAt: number | null][]
): TracksLikedResult {
  return { likes: likes.map(([trackId, likedAt]) => ({ likedAt, trackId })), revision };
}

function tupleOf(track: Track): TrackTuple {
  return [
    track.addedAt,
    track.album,
    track.albumArtists,
    track.artists,
    track.artworkUrl,
    track.unavailableReason,
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
    unavailableReason: null,
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
