import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import type {
  LumeApi,
  MusicLibrary,
  PlaylistCreationInput,
  PlaylistDetails,
  PlaylistSummary,
  Track,
} from "../shared/lib";
import { AudioPlayerProvider } from "@/hooks/use-audio-player";
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
});

describe("playlist behavior", () => {
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
      addTrackToPlaylist: (playlistId, trackId) => {
        calls.additions.push({ playlistId, trackId });

        if (calls.additions.length > 1) return Promise.resolve({ kind: "duplicate" });

        state.playlists.set(archive.id, { ...archive, tracks: [firstTrack] });
        state.library = {
          ...state.library,
          playlists: [{ ...archiveSummary, trackCount: 1 }, directSummary],
        };

        return Promise.resolve({ kind: "added", track: firstTrack });
      },
      confirmAddTrackToPlaylist: (playlistId, trackId) => {
        calls.confirmedAddition = { playlistId, trackId };
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
      removePlaylistTrack: (playlistId, playlistTrackId) => {
        calls.removed = { playlistId, playlistTrackId };
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
      removePlaylistTrack: (playlistId, playlistTrackId) => {
        calls.removed = { playlistId, playlistTrackId };
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
    await expect.element(nextButton).toBeDisabled();

    expect(calls).toEqual({
      deleted: playlist.id,
      removed: { playlistId: playlist.id, playlistTrackId: 201 },
    });
  });
});

function renderApplication(api: LumeApi, hash = "#/") {
  window.lume = api;
  window.location.hash = hash;

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <AudioPlayerProvider>
        <RouterProvider router={createAppRouter()} />
      </AudioPlayerProvider>
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
  const sampleRate = 8_000;
  const dataLength = sampleRate * 30;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + dataLength, true);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  bytes.set(new TextEncoder().encode("fmt "), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, dataLength, true);
  bytes.fill(128, 44);

  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  audioUrls.push(url);

  return url;
}

function createTestApi(createOverrides: () => Partial<LumeApi>): LumeApi {
  // Browser tests advance through fixed API responses. Store rules belong to the SQLite tests.
  const rejectUnexpected = (operation: string) =>
    Promise.reject(new Error(`Unexpected ${operation} request`));

  return {
    addTrackToPlaylist: () => rejectUnexpected("addTrackToPlaylist"),
    addSource: () => rejectUnexpected("addSource"),
    confirmAddTrackToPlaylist: () => rejectUnexpected("confirmAddTrackToPlaylist"),
    createPlaylist: () => rejectUnexpected("createPlaylist"),
    createPlaylistFromTrack: () => rejectUnexpected("createPlaylistFromTrack"),
    deletePlaylist: () => rejectUnexpected("deletePlaylist"),
    disableSource: () => rejectUnexpected("disableSource"),
    enableSource: () => rejectUnexpected("enableSource"),
    forgetSource: () => rejectUnexpected("forgetSource"),
    loadLibrary: () => rejectUnexpected("loadLibrary"),
    loadPlaylist: () => rejectUnexpected("loadPlaylist"),
    onLibraryUpdate: () => () => {},
    openDataFolder: () => rejectUnexpected("openDataFolder"),
    removePlaylistTrack: () => rejectUnexpected("removePlaylistTrack"),
    rescanSource: () => rejectUnexpected("rescanSource"),
    rescanSources: () => rejectUnexpected("rescanSources"),
    isMac: false,
    ...createOverrides(),
  };
}
