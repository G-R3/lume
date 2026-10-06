import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type {
  LumeApi,
  MusicLibrary,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistSummary,
  Track,
} from "../shared/lib";
import { createTestApi } from "./helpers/lume-api";
import { createWaveAudio } from "./helpers/wave-audio";
import { PlaybackProvider } from "@/hooks/use-playback";
import { serializeQueueSession, transition } from "@/lib/queue";
import { createAppRouter } from "@/router";
import "@/index.css";

type EditingCalls = {
  additions: { playlistId: number; trackId: number }[];
  confirmedAddition: { playlistId: number; trackId: number } | null;
  createdFromTrack: number | null;
  creation: PlaylistCreationInput | null;
  deleted: number | null;
  removed: { playlistId: number; playlistTrackId: number } | null;
};

type PlaybackCalls = {
  deleted: number | null;
  removed: { playlistId: number; playlistTrackId: number } | null;
};

const mountedRoots: Root[] = [];

const audioUrls: string[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  audioUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  document.body.replaceChildren();
  window.location.hash = "#/";
  localStorage.removeItem("lume.audio");
});

describe("playlist behavior", () => {
  it("toggles shuffle with the keyboard without interrupting audio and starts fresh header playback", async () => {
    const playlist = {
      id: 20,
      title: "Playback",
      description: null,
      tracks: [{ id: 201, trackId: 1, position: 0 }],
    } satisfies PlaylistDetails;

    const state = createRendererState([createTrack(1, "Midnight")], [playlist]);
    renderApplication(
      createTestApi(() => ({
        loadLibrary: () => Promise.resolve(state.library),
        loadPlaylist: () => Promise.resolve(playlist),
      })),
      "#/playlists/20",
    );
    await page
      .getByRole("table", { name: "Playback tracks" })
      .getByRole("button", { exact: true, name: "Midnight" })
      .click();
    const player = page.getByRole("contentinfo");
    const pauseButton = player.getByRole("button", { exact: true, name: "Pause" });
    await pauseButton.click();
    const audio = currentAudio();
    await expect.poll(() => audio.readyState).toBe(4);
    audio.currentTime = 19;
    const toggle = player.getByRole("button", { exact: true, name: "Shuffle" });
    toggle.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();
    await expect.element(player.getByRole("button", { exact: true, name: "Play" })).toBeVisible();
    expect(currentAudio()).toBe(audio);
    expect(audio.currentTime).toBe(19);
    expect(audio.paused).toBe(true);

    await userEvent.keyboard("{Enter}");
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
    expect(currentAudio()).toBe(audio);
    expect(audio.currentTime).toBe(19);
    expect(audio.paused).toBe(true);

    const header = page.getByRole("button", { exact: true, name: "Shuffle play" });
    await expect.element(header).not.toHaveAttribute("aria-pressed");

    // Each click starts over from zero, even after the previous session was paused partway
    for (let click = 0; click < 2; click++) {
      await header.click();
      await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
      await expect.element(pauseButton).toBeVisible();
      expect(currentAudio().currentTime).toBeLessThan(2);
      expect(currentAudio().paused).toBe(false);
      await pauseButton.click();
      currentAudio().currentTime = 19;
    }
  });

  it("adjusts volume immediately and restores volume and mute across player restarts", async () => {
    localStorage.setItem("lume.audio", JSON.stringify({ volume: 0.6, muted: false }));
    const state = createRendererState([createTrack(1, "Midnight"), createTrack(2, "Sunrise")]);
    const api = createTestApi(() => ({ loadLibrary: () => Promise.resolve(state.library) }));

    renderApplication(api);

    await page
      .getByRole("table", { name: "All tracks" })
      .getByRole("button", { exact: true, name: "Midnight" })
      .click();
    const volume = page.getByRole("slider", { name: "Volume" });

    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0.6);
    const control = volume.element().closest("[data-base-ui-slider-control]");

    if (!control) throw new Error("Expected the volume slider control");

    await userEvent.dragAndDrop(control, control, { targetPosition: { x: 20, y: 12 } });
    await expect.poll(() => document.querySelector("audio")?.volume).toBeLessThan(0.6);
    expect(document.querySelector("audio")?.volume).toBeGreaterThan(0);
    volume.element().focus();
    await userEvent.keyboard("{Home}{ArrowRight}");
    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0.01);
    await expect.element(volume).toHaveAttribute("aria-valuetext", "1%");
    await expect
      .poll(() => JSON.parse(localStorage.getItem("lume.audio") ?? "null"))
      .toEqual({ volume: 0.01, muted: false });

    await page.getByRole("button", { name: "Mute audio", exact: true }).click();
    await expect.poll(() => document.querySelector("audio")?.muted).toBe(true);
    await expect.element(volume).toHaveAttribute("aria-valuenow", "0");
    await expect.element(volume).toHaveAttribute("aria-valuetext", "0%");
    await page.getByRole("button", { name: "Next track" }).click();
    await expect
      .element(page.getByRole("contentinfo").getByText("Sunrise", { exact: true }))
      .toBeVisible();
    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0.01);
    await expect.poll(() => document.querySelector("audio")?.muted).toBe(true);
    await expect
      .poll(() => JSON.parse(localStorage.getItem("lume.audio") ?? "null"))
      .toEqual({ volume: 0.01, muted: true });

    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.replaceChildren();
    renderApplication(api);

    await page
      .getByRole("table", { name: "All tracks" })
      .getByRole("button", { exact: true, name: "Midnight" })
      .click();
    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0.01);
    await expect.poll(() => document.querySelector("audio")?.muted).toBe(true);
    await page.getByRole("button", { name: "Unmute audio", exact: true }).click();
    await expect.poll(() => document.querySelector("audio")?.muted).toBe(false);
    await expect.element(volume).toHaveAttribute("aria-valuenow", "0.01");
    await expect.element(volume).toHaveAttribute("aria-valuetext", "1%");
    expect(document.querySelector("audio")?.volume).toBe(0.01);

    page.getByRole("slider", { name: "Volume" }).element().focus();
    await userEvent.keyboard("{Home}");
    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0);
    await expect
      .element(page.getByRole("button", { name: "Unmute audio", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => document.querySelector("audio")?.volume).toBe(0.01);
    await expect
      .element(page.getByRole("button", { name: "Mute audio", exact: true }))
      .toBeVisible();
  });

  it("returns a finished single-track playlist to the beginning paused, then plays again", async () => {
    const midnight = createTrack(1, "Midnight");

    const playlist = {
      id: 20,
      title: "Playback",
      description: null,
      tracks: [{ id: 201, trackId: midnight.id, position: 0 }],
    } satisfies PlaylistDetails;

    const state = createRendererState([midnight], [playlist]);

    renderApplication(
      createTestApi(() => ({
        loadLibrary: () => Promise.resolve(state.library),
        loadPlaylist: () => Promise.resolve(playlist),
      })),
      "#/playlists/20",
    );

    await page
      .getByRole("table", { name: "Playback tracks" })
      .getByRole("button", { exact: true, name: "Midnight" })
      .click();

    const player = page.getByRole("contentinfo");
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    const audio = document.querySelector("audio");

    if (!audio) throw new Error("Expected the playing audio");

    await expect.poll(() => audio.duration).toBeGreaterThan(0);

    audio.currentTime = audio.duration - 0.05;

    await expect.element(player.getByRole("button", { exact: true, name: "Play" })).toBeVisible();
    await expect.poll(() => document.querySelector("audio")?.currentTime).toBe(0);

    expect(document.querySelector("audio")?.paused).toBe(true);

    await player.getByRole("button", { exact: true, name: "Play" }).click();
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.poll(() => document.querySelector("audio")?.currentTime ?? 0).toBeGreaterThan(0);
  });

  it("resumes a restored track at its saved position after enabling its source", async () => {
    const midnight = createTrack(1, "Midnight", false);

    const state: { library: MusicLibrary } = createRendererState([
      midnight,
      createTrack(2, "Sunrise"),
    ]);

    state.library.sources.push({
      id: 1,
      path: "/Music",
      enabled: false,
      lastScanError: null,
      lastScannedAt: null,
      trackCount: 0,
    });

    const queue = transition(
      null,
      {
        type: "startFromSource",
        source: { kind: "all-tracks" },
        sessionId: "saved",
        entries: state.library.tracks.map((track) => ({
          sourceEntryId: track.id,
          trackId: track.id,
        })),
        startEntryId: midnight.id,
      },
      new Set([1, 2]),
    );

    if (!queue) throw new Error("Expected a saved queue");
    renderApplication(
      createTestApi(() => ({
        loadLibrary: () => Promise.resolve(state.library),
        playbackSession: {
          load: () => Promise.resolve({ payload: serializeQueueSession(queue), position: 7.25 }),
          save: () => Promise.resolve(),
          savePosition: () => Promise.resolve(),
          flush: () => {},
        },
        enableSource: () => {
          state.library = {
            ...state.library,
            sources: state.library.sources.map((source) => ({
              ...source,
              enabled: true,
              trackCount: 2,
            })),
            tracks: state.library.tracks.map((track) => ({ ...track, available: true })),
          };

          return Promise.resolve(state.library);
        },
      })),
      "#/settings",
    );
    const player = page.getByRole("contentinfo");
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();

    expect(document.querySelector("audio")).toBeNull();

    await page.getByRole("switch", { name: "Enable Music" }).click();
    await expect.poll(() => document.querySelector("audio")?.currentTime).toBe(7.25);

    expect(document.querySelector("audio")?.paused).toBe(true);

    await player.getByRole("button", { exact: true, name: "Play" }).click();

    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();

    await expect
      .poll(() => document.querySelector("audio")?.currentTime ?? 0)
      .toBeGreaterThan(7.25);

    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("adds, removes, and jumps in the queue without changing the source list", async () => {
    const state = createRendererState([
      createTrack(1, "A"),
      createTrack(2, "B"),
      createTrack(3, "C"),
    ]);

    renderApplication(createTestApi(() => ({ loadLibrary: () => Promise.resolve(state.library) })));

    const table = page.getByRole("table", { name: "All tracks" });
    await table.getByRole("button", { exact: true, name: "A" }).click();
    await page.getByRole("button", { name: "Open queue sidebar" }).click();
    const panel = page.getByRole("complementary", { name: "Playback queue" });

    await table.getByRole("button", { name: "More options for C" }).click();
    await page.getByRole("menuitem", { name: "Add to queue" }).click();
    await expect
      .element(panel.getByRole("region", { name: "Next in queue" }))
      .toHaveTextContent("C");

    await panel.getByRole("button", { name: "Queue options for B" }).click();
    await page.getByRole("menuitem", { name: "Remove from queue" }).click();
    await expect.element(panel.getByRole("button", { name: "Play C now" }).last()).toHaveFocus();
    await expect.element(table.getByRole("button", { exact: true, name: "B" })).toBeVisible();

    await panel
      .getByRole("region", { name: "Next in queue" })
      .getByRole("button", {
        name: "Play C now",
      })
      .click();
    await expect.element(panel.getByRole("heading", { name: "Now playing" })).toHaveFocus();
    await expect.element(panel.getByRole("region", { name: "Now playing" })).toHaveTextContent("C");
    await expect
      .element(panel.getByRole("region", { name: "Next from All tracks" }))
      .toHaveTextContent("C");
  });

  it("starts the first track from the beginning with the collection Play action", async () => {
    const midnight = createTrack(1, "Midnight");
    const sunrise = createTrack(2, "Sunrise");
    const state = createRendererState([midnight, sunrise]);

    renderApplication(createTestApi(() => ({ loadLibrary: () => Promise.resolve(state.library) })));

    const table = page.getByRole("table", { name: "All tracks" });
    const player = page.getByRole("contentinfo");
    const playbackActions = page.getByRole("group", { name: "Playback actions" });

    await table.getByRole("button", { exact: true, name: "Sunrise" }).click();
    await expect.element(player.getByText("Sunrise", { exact: true })).toBeVisible();

    await playbackActions.getByRole("button", { exact: true, name: "Play" }).click();
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();

    const audio = document.querySelector("audio");

    if (!audio) throw new Error("Expected the collection Play action to create audio");

    await expect.poll(() => audio.duration).toBeGreaterThan(0);
    audio.currentTime = 10;
    await player.getByRole("button", { name: "Pause" }).click();
    await playbackActions.getByRole("button", { exact: true, name: "Play" }).click();

    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    const restartedAudio = document.querySelector("audio");

    if (!restartedAudio) throw new Error("Expected the collection Play action to restart audio");

    expect(restartedAudio.currentTime).toBeLessThan(1);
    await expect
      .element(playbackActions.getByRole("button", { name: "Shuffle play" }))
      .toBeEnabled();
  });

  it("completes the playlist editing lifecycle through the renderer API", async () => {
    const midnight = {
      ...createTrack(1, "Midnight"),
      album: "Signals After Dark",
      artists: ["Neon Static"],
    };

    const archive = {
      description: null,
      tracks: [],
      id: 10,
      title: "Archive",
    } satisfies PlaylistDetails;

    const directPlaylist = {
      description: null,
      tracks: [{ id: 101, position: 0, trackId: midnight.id }],
      id: 11,
      title: "Midnight",
    } satisfies PlaylistDetails;

    const archiveSummary = summarize(archive);
    const directSummary = summarize(directPlaylist);
    const firstTrack = { id: 102, position: 0, trackId: midnight.id };
    const duplicateTrack = { id: 103, position: 1, trackId: midnight.id };
    const state = createRendererState([midnight]);

    const calls: EditingCalls = {
      additions: [],
      confirmedAddition: null,
      createdFromTrack: null,
      creation: null,
      deleted: null,
      removed: null,
    };

    const api = createTestApi(() => ({
      addTrackToPlaylist: (input) => {
        calls.additions.push(input);

        if (calls.additions.length > 1) return Promise.resolve({ kind: "duplicate" });

        state.playlists.set(archive.id, { ...archive, tracks: [firstTrack] });
        state.library = {
          ...state.library,
          playlists: [{ ...archiveSummary, trackCount: 1 }, directSummary],
        };

        return Promise.resolve({ kind: "added", track: firstTrack });
      },
      confirmAddTrackToPlaylist: (input) => {
        calls.confirmedAddition = input;
        state.playlists.set(archive.id, {
          ...archive,
          tracks: [firstTrack, duplicateTrack],
        });
        state.library = {
          ...state.library,
          playlists: [{ ...archiveSummary, trackCount: 2 }, directSummary],
        };

        return Promise.resolve(duplicateTrack);
      },
      createPlaylist: (input) => {
        calls.creation = input;
        state.playlists.set(archive.id, archive);
        state.library = { ...state.library, playlists: [archiveSummary] };

        return Promise.resolve({ library: state.library, playlist: archiveSummary });
      },
      createPlaylistFromTrack: (trackId) => {
        calls.createdFromTrack = trackId;
        state.playlists.set(directPlaylist.id, directPlaylist);
        state.library = {
          ...state.library,
          playlists: [archiveSummary, directSummary],
        };

        return Promise.resolve(directPlaylist);
      },
      deletePlaylist: (playlistId) => {
        calls.deleted = playlistId;
        state.playlists.delete(archive.id);
        state.library = { ...state.library, playlists: [directSummary] };

        return Promise.resolve(state.library);
      },
      loadLibrary: () => Promise.resolve(state.library),
      loadPlaylist: (playlistId) => Promise.resolve(state.playlists.get(playlistId) ?? null),
      removePlaylistTrack: (input) => {
        calls.removed = input;
        state.playlists.set(archive.id, { ...archive, tracks: [duplicateTrack] });
        state.library = {
          ...state.library,
          playlists: [{ ...archiveSummary, trackCount: 1 }, directSummary],
        };

        return Promise.resolve();
      },
    }));

    renderApplication(api);

    await page.getByRole("button", { name: "Create playlist" }).click();
    const creationDialog = page.getByRole("dialog");
    await creationDialog.getByLabelText("Title").fill("Archive");
    await creationDialog.getByRole("button", { name: "Create playlist" }).click();
    await expect.poll(() => window.location.hash).toBe("#/playlists/10");

    await page.getByRole("link", { name: /All tracks/ }).click();
    const allTracks = page.getByRole("table", { name: "All tracks" });

    await expect.element(allTracks.getByText("Neon Static", { exact: true })).toBeVisible();
    await expect.element(allTracks.getByText("Signals After Dark", { exact: true })).toBeVisible();

    await allTracks.getByRole("button", { name: "More options for Midnight" }).click();
    await page.getByRole("menuitem", { name: "New playlist" }).click();
    await expect.poll(() => window.location.hash).toBe("#/playlists/11");

    await page.getByRole("link", { name: /All tracks/ }).click();
    await allTracks.getByRole("button", { name: "More options for Midnight" }).click();
    await page.getByRole("menuitem", { name: "Add to playlist" }).click();
    const picker = page.getByRole("dialog");
    await picker.getByLabelText("Search playlists").fill("arch");
    await expect.element(picker.getByRole("button", { name: /Midnight/ })).not.toBeInTheDocument();
    await picker.getByRole("button", { name: /Archive/ }).click();

    await allTracks.getByRole("button", { name: "More options for Midnight" }).click();
    await page.getByRole("menuitem", { name: "Add to playlist" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Archive/ })
      .click();
    await page.getByRole("button", { name: "Add anyway" }).click();
    await page.getByRole("link", { name: /Archive/ }).click();

    const table = page.getByRole("table", { name: "Archive tracks" });
    const occurrences = table.getByRole("button", { exact: true, name: "Midnight" });
    await expect.element(occurrences.nth(1)).toBeVisible();
    expect(occurrences.length).toBe(2);

    await table.getByRole("button", { name: "More options for Midnight" }).first().click();
    await page.getByRole("menuitem", { name: "Remove from playlist" }).click();
    await expect.element(occurrences.nth(1)).not.toBeInTheDocument();
    expect(occurrences.length).toBe(1);

    await page.getByRole("button", { name: "More options for Archive" }).last().click();
    await page.getByRole("menuitem", { name: "Delete playlist" }).click();
    await page.getByRole("button", { name: "Delete playlist" }).click();
    await expect.poll(() => window.location.hash).toBe("#/");

    window.location.hash = "#/playlists/10";
    await expect.poll(() => window.location.hash).toBe("#/");

    expect(calls).toEqual({
      additions: [
        { playlistId: archive.id, trackId: midnight.id },
        { playlistId: archive.id, trackId: midnight.id },
      ],
      confirmedAddition: { playlistId: archive.id, trackId: midnight.id },
      createdFromTrack: midnight.id,
      creation: { description: null, title: "Archive" },
      deleted: archive.id,
      removed: { playlistId: archive.id, playlistTrackId: firstTrack.id },
    });
  });

  it("keeps current audio through removal and deletion while skipping unavailable tracks", async () => {
    const midnight = createTrack(1, "Midnight");
    const unavailable = createTrack(2, "Missing", false);
    const sunrise = createTrack(3, "Sunrise");

    const playlist = {
      description: null,
      tracks: [
        { id: 201, position: 0, trackId: midnight.id },
        { id: 202, position: 1, trackId: unavailable.id },
        { id: 203, position: 2, trackId: midnight.id },
        { id: 204, position: 3, trackId: sunrise.id },
      ],
      id: 20,
      title: "Playback",
    } satisfies PlaylistDetails;

    const playlistAfterRemoval = {
      ...playlist,
      tracks: [
        { id: 202, position: 1, trackId: unavailable.id },
        { id: 203, position: 2, trackId: midnight.id },
        { id: 204, position: 3, trackId: sunrise.id },
      ],
    } satisfies PlaylistDetails;

    const state = createRendererState([midnight, unavailable, sunrise], [playlist]);

    const calls: PlaybackCalls = {
      deleted: null,
      removed: null,
    };

    const api = createTestApi(() => ({
      deletePlaylist: (playlistId) => {
        calls.deleted = playlistId;
        state.playlists.delete(playlist.id);
        state.library = { ...state.library, playlists: [] };

        return Promise.resolve(state.library);
      },
      loadLibrary: () => Promise.resolve(state.library),
      loadPlaylist: (playlistId) => Promise.resolve(state.playlists.get(playlistId) ?? null),
      removePlaylistTrack: (input) => {
        calls.removed = input;
        state.playlists.set(playlist.id, playlistAfterRemoval);
        state.library = {
          ...state.library,
          playlists: [{ ...summarize(playlist), trackCount: 3 }],
        };

        return Promise.resolve();
      },
    }));

    renderApplication(api, "#/playlists/20");

    const table = page.getByRole("table", { name: "Playback tracks" });
    const firstOccurrence = table.getByRole("button", { exact: true, name: "Midnight" }).first();
    const player = page.getByRole("contentinfo");
    const nextButton = player.getByRole("button", { name: "Next track" });

    await firstOccurrence.click();
    await expect.element(firstOccurrence).toHaveAttribute("aria-current", "true");
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();

    await table.getByRole("button", { name: "More options for Midnight" }).first().click();
    await page.getByRole("menuitem", { name: "Remove from playlist" }).click();
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.element(nextButton).toBeEnabled();

    await nextButton.click();

    const remainingMidnight = table.getByRole("button", { exact: true, name: "Midnight" });
    await expect.element(remainingMidnight).toHaveAttribute("aria-current", "true");

    await nextButton.click();
    const sunriseRow = table.getByRole("button", { exact: true, name: "Sunrise" });
    await expect.element(sunriseRow).toHaveAttribute("aria-current", "true");
    await player.getByRole("button", { name: "Previous track" }).click();
    await expect.element(remainingMidnight).toHaveAttribute("aria-current", "true");

    await page.getByRole("button", { name: "More options for Playback" }).last().click();
    await page.getByRole("menuitem", { name: "Delete playlist" }).click();
    await page.getByRole("button", { name: "Delete playlist" }).click();
    await expect.poll(() => window.location.hash).toBe("#/");
    await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();
    await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.element(nextButton).toBeEnabled();
    await nextButton.click();
    await expect.element(player.getByText("Sunrise", { exact: true })).toBeVisible();

    expect(calls).toEqual({
      deleted: playlist.id,
      removed: { playlistId: playlist.id, playlistTrackId: 201 },
    });
  });
  it.each([false, true])(
    "does not highlight All tracks after deleting the playing playlist, current entry removed: %s",
    async (removeCurrent) => {
      const midnight = createTrack(1, "Midnight");
      const sunrise = createTrack(2, "Sunrise");

      const playlist = {
        description: null,
        id: 20,
        title: "Playback",
        tracks: [
          { id: 2, position: 0, trackId: midnight.id },
          { id: 3, position: 1, trackId: sunrise.id },
        ],
      } satisfies PlaylistDetails;

      const state = createRendererState([midnight, sunrise], [playlist]);

      renderApplication(
        createTestApi(() => ({
          loadLibrary: () => Promise.resolve(state.library),
          loadPlaylist: (id) => Promise.resolve(state.playlists.get(id) ?? null),
          removePlaylistTrack: () => {
            state.playlists.set(playlist.id, { ...playlist, tracks: playlist.tracks.slice(1) });

            return Promise.resolve();
          },
          deletePlaylist: () => {
            state.playlists.delete(playlist.id);
            state.library = { ...state.library, playlists: [] };

            return Promise.resolve(state.library);
          },
        })),
        "#/playlists/20",
      );

      const table = page.getByRole("table", { name: "Playback tracks" });
      await table.getByRole("button", { exact: true, name: "Midnight" }).click();
      const player = page.getByRole("contentinfo");
      await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();
      await expect
        .element(table.getByRole("button", { exact: true, name: "Midnight" }))
        .toHaveAttribute("aria-current", "true");
      await expect.element(table.getByLabelText("Playing")).toBeVisible();

      if (removeCurrent) {
        await table.getByRole("button", { name: "More options for Midnight" }).click();
        await page.getByRole("menuitem", { name: "Remove from playlist" }).click();
        await expect
          .element(table.getByRole("button", { exact: true, name: "Midnight" }))
          .not.toBeInTheDocument();
      }

      await page.getByRole("button", { name: "More options for Playback" }).last().click();
      await page.getByRole("menuitem", { name: "Delete playlist" }).click();
      await page.getByRole("button", { name: "Delete playlist" }).click();
      await expect.poll(() => window.location.hash).toBe("#/");
      await expect.element(player.getByText("Midnight", { exact: true })).toBeVisible();
      await expect.element(player.getByRole("button", { name: "Pause" })).toBeVisible();

      const allTracks = page.getByRole("table", { name: "All tracks" });
      await expect
        .element(allTracks.getByRole("button", { exact: true, name: "Sunrise" }))
        .not.toHaveAttribute("aria-current", "true");
      await expect
        .element(allTracks.getByRole("button", { exact: true, name: "Midnight" }))
        .not.toHaveAttribute("aria-current", "true");
      await expect.element(allTracks.getByLabelText("Playing")).not.toBeInTheDocument();
    },
  );

  it.each(["row", "audio player"] as const)("likes a track from its %s", async (entryPoint) => {
    const track = createTrack(1, "Midnight");
    const state = createRendererState([track]);
    const calls: { liked: boolean; trackId: number }[] = [];

    const api = createTestApi(() => ({
      loadLibrary: () => Promise.resolve(state.library),
      setTrackLiked: (input) => {
        calls.push(input);

        return Promise.resolve({ likedAt: 1, trackId: input.trackId });
      },
    }));

    renderApplication(api);

    const table = page.getByRole("table", { name: "All tracks" });

    if (entryPoint === "audio player") {
      await table.getByRole("button", { exact: true, name: "Midnight" }).click();
    }

    const target = entryPoint === "row" ? table : page.getByRole("contentinfo");
    await target.getByRole("button", { name: "Like Midnight" }).click();

    expect(calls).toEqual([{ liked: true, trackId: track.id }]);
    await expect.element(target.getByRole("button", { name: "Unlike Midnight" })).toBeVisible();
  });
});

function currentAudio() {
  const audio = document.querySelector("audio");

  if (!audio) throw new Error("Expected loaded audio");

  return audio;
}

function renderApplication(api: LumeApi, hash = "#/") {
  window.lume = api;
  window.location.hash = hash;

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <PlaybackProvider>
        <RouterProvider router={createAppRouter()} />
      </PlaybackProvider>
    </QueryClientProvider>,
  );
}

function createRendererState(tracks: Track[], playlists: PlaylistDetails[] = []) {
  return {
    library: {
      kind: "library",
      playlists: playlists.map(summarize),
      sources: [],
      tracks,
    } satisfies MusicLibrary,
    playlists: new Map(playlists.map((playlist) => [playlist.id, playlist])),
  };
}

function summarize(playlist: PlaylistDetails): PlaylistSummary {
  return {
    description: playlist.description,
    trackCount: playlist.tracks.length,
    id: playlist.id,
    title: playlist.title,
  };
}

function createTrack(id: number, title: string, available = true): Track {
  return {
    album: "Unknown album",
    albumArtists: ["Unknown artist"],
    artists: ["Unknown artist"],
    artworkUrl: null,
    available,
    bitrate: null,
    bitsPerSample: null,
    channelCount: 1,
    codec: "PCM",
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "WAV",
    genres: [],
    id,
    likedAt: null,
    lossless: true,
    sampleRate: 8_000,
    trackNumber: null,
    trackTotal: null,
    title,
    url: createSilentAudioUrl(),
    year: null,
  };
}

function createSilentAudioUrl() {
  const url = URL.createObjectURL(new Blob([createWaveAudio(30)], { type: "audio/wav" }));
  audioUrls.push(url);

  return url;
}
