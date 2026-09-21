// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";
import type { LibrarySnapshot, LumeApi } from "../shared/lib";
import App from "./App";
import { AudioPlayerProvider } from "@/hooks/use-audio-player";
import { createAppRouter } from "@/router";

describe("App library startup", () => {
  it("shows a recoverable error when the initial library request fails", async () => {
    const firstRun = { kind: "first-run" } satisfies LibrarySnapshot;

    const responses = [
      () => Promise.reject(new Error("Database read failed")),
      () => Promise.resolve(firstRun),
    ];

    window.lume = createLumeApi(() => responses.shift()?.() ?? Promise.resolve(firstRun));
    const container = document.createElement("div");
    const root = createRoot(container);
    const queryClient = new QueryClient();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AudioPlayerProvider>
            <App />
          </AudioPlayerProvider>
        </QueryClientProvider>,
      );
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(container.textContent).toContain("Lume could not load your library");
    expect(container.textContent).toContain("Database read failed");

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );

    if (!retryButton) throw new Error("Expected the error state to offer a retry action");

    await act(async () => retryButton.click());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(container.textContent).toContain("Add your music to Lume");
    await act(async () => root.unmount());
  });

  it("renders the settings route from the window hash", async () => {
    window.lume = createLumeApi(() =>
      Promise.resolve({
        kind: "library",
        playlists: [],
        sources: [],
        tracks: [],
      }),
    );
    window.location.hash = "#/settings";
    const container = document.createElement("div");
    const root = createRoot(container);
    const queryClient = new QueryClient();
    const router = createAppRouter();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AudioPlayerProvider>
            <RouterProvider router={router} />
          </AudioPlayerProvider>
        </QueryClientProvider>,
      );
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(container.textContent).toContain("Library sources");
    await act(async () => root.unmount());
  });
});

function createLumeApi(loadLibrary: LumeApi["loadLibrary"]): LumeApi {
  const firstRun = { kind: "first-run" } satisfies LibrarySnapshot;
  const firstRunPromise = Promise.resolve(firstRun);

  return {
    addTrackToPlaylist: () => Promise.resolve({ kind: "duplicate" }),
    addSource: () => firstRunPromise,
    confirmAddTrackToPlaylist: (input) =>
      Promise.resolve({ id: 1, position: 0, trackId: input.trackId }),
    createPlaylist: (input) =>
      Promise.resolve({
        library: firstRun,
        playlist: {
          description: input.description,
          trackCount: 0,
          id: 1,
          title: input.title,
        },
      }),
    createPlaylistFromTrack: (trackId) =>
      Promise.resolve({
        description: null,
        tracks: [{ id: 1, position: 0, trackId }],
        id: 1,
        title: "Playlist",
      }),
    deletePlaylist: () => firstRunPromise,
    disableSource: () => firstRunPromise,
    enableSource: () => firstRunPromise,
    forgetSource: () => firstRunPromise,
    loadLibrary,
    loadPlaylist: () => Promise.resolve(null),
    onLibraryUpdate: () => () => {},
    openDataFolder: () => Promise.resolve(),
    removePlaylistTrack: () => Promise.resolve(),
    rescanSource: () => firstRunPromise,
    rescanSources: () => firstRunPromise,
    setTrackLiked: (input) =>
      Promise.resolve({ likedAt: input.liked ? Date.now() : null, trackId: input.trackId }),
    isMac: false,
  };
}
