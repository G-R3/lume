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
    expect(retryButton).toBeDefined();

    await act(async () => retryButton?.click());
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
  const firstRun = Promise.resolve({ kind: "first-run" } satisfies LibrarySnapshot);

  return {
    addSource: () => firstRun,
    createPlaylist: () => firstRun,
    deletePlaylist: () => firstRun,
    disableSource: () => firstRun,
    enableSource: () => firstRun,
    forgetSource: () => firstRun,
    loadLibrary,
    onLibraryUpdate: () => () => {},
    openDataFolder: () => Promise.resolve(),
    rescanSource: () => firstRun,
    rescanSources: () => firstRun,
    isMac: false,
  };
}
