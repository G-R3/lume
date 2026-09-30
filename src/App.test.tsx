// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";
import type { LibrarySnapshot } from "../shared/lib";
import App from "./App";
import { PlaybackProvider } from "@/hooks/use-playback";
import { createTestApi } from "../tests/helpers/lume-api";

describe("App library startup", () => {
  it("shows a recoverable error when the initial library request fails", async () => {
    const firstRun = { kind: "first-run" } satisfies LibrarySnapshot;

    const responses = [
      () => Promise.reject(new Error("Database read failed")),
      () => Promise.resolve(firstRun),
    ];

    window.lume = createTestApi(() => ({
      loadLibrary: () => responses.shift()?.() ?? Promise.resolve(firstRun),
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    const queryClient = new QueryClient();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PlaybackProvider>
            <App />
          </PlaybackProvider>
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
});
