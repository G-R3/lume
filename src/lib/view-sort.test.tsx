// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import { defaultSort, trackSort, type SortField, type TrackSort } from "./track-sort";

const allTracks = { kind: "all-tracks" } as const;

const playlist = (playlistId: number) => ({ kind: "playlist", playlistId }) as const;

async function freshStore() {
  vi.resetModules();

  return import("./view-sort");
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

describe("view sorts", () => {
  it("keeps Tracks and each playlist separate across a relaunch", async () => {
    const store = await freshStore();
    store.stepViewSort(allTracks, "title");
    store.stepViewSort(playlist(1), "duration");
    store.stepViewSort(playlist(1), "duration");

    const relaunched = await freshStore();

    expect([
      relaunched.getViewSort(allTracks),
      relaunched.getViewSort(playlist(1)),
      relaunched.getViewSort(playlist(2)),
    ]).toEqual([trackSort("title", "asc"), trackSort("duration", "desc"), defaultSort]);
  });

  it("stores nothing for the default sort", async () => {
    const store = await freshStore();
    store.stepViewSort(allTracks, "album");
    expect(localStorage.getItem("lume:sort:all-tracks")).toBe("album:asc");

    store.stepViewSort(allTracks, "album");
    store.stepViewSort(allTracks, "album");

    expect(store.getViewSort(allTracks)).toEqual(defaultSort);
    expect(localStorage.length).toBe(0);
  });

  it.each(["garbage", "title", "title:sideways", ""])(
    "reads a stored %j as the default",
    async (raw) => {
      localStorage.setItem("lume:sort:playlist:4", raw);

      expect((await freshStore()).getViewSort(playlist(4))).toEqual(defaultSort);
    },
  );

  it("forgets a playlist's sort, and forgetting twice changes nothing", async () => {
    const store = await freshStore();
    store.stepViewSort(playlist(3), "title");
    store.forgetViewSort(playlist(3));
    store.forgetViewSort(playlist(3));

    expect(store.getViewSort(playlist(3))).toEqual(defaultSort);
    expect(localStorage.getItem("lume:sort:playlist:3")).toBeNull();
    expect((await freshStore()).getViewSort(playlist(3))).toEqual(defaultSort);
  });

  it("drops the old global sort key", async () => {
    localStorage.setItem("lume:track-sort", "title");
    await freshStore();

    expect(localStorage.getItem("lume:track-sort")).toBeNull();
  });

  it("steps from the latest sort even through a setter from an earlier render", async () => {
    const { useViewSort } = await freshStore();
    const renders: TrackSort[] = [];
    let firstSortBy: ((field: SortField) => void) | undefined;

    function Probe() {
      const [sort, sortBy] = useViewSort(allTracks);
      renders.push(sort);
      firstSortBy ??= sortBy;

      return null;
    }

    const root = createRoot(document.createElement("div"));
    onTestFinished(() => act(() => root.unmount()));
    act(() => root.render(<Probe />));

    act(() => {
      firstSortBy?.("duration");
      firstSortBy?.("duration");
    });

    expect(renders.at(-1)).toEqual(trackSort("duration", "desc"));
  });
});
