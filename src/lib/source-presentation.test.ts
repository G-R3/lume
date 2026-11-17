import { describe, expect, it } from "vite-plus/test";
import type {
  LibrarySource,
  MusicLibrary,
  SourceStatus,
  Track,
  TrackUnavailableReason,
} from "@shared/library";
import { presentLibrarySources } from "./source-presentation";

const now = new Date(2026, 10, 11, 12, 0).getTime();

const idle = new Set<number>();

const minute = 60_000;

const hour = 60 * minute;

const day = 24 * hour;

const lastYear = new Date(2025, 2, 4, 12, 0).getTime();

const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const shortDateWithYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const permissionCopy =
  "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";

const missingDetail = "ENOENT: no such file or directory, scandir '/music/b'";

const off: SourceStatus = { kind: "off" };

const unscanned: SourceStatus = { kind: "unscanned" };

function scanned(age: number, trackCount = 12): SourceStatus {
  return { kind: "scanned", scannedAt: now - age, trackCount };
}

function missing(lastScannedAt: number | null): SourceStatus {
  return { errorMessage: missingDetail, kind: "missing", lastScannedAt };
}

function failed(errorMessage: string): SourceStatus {
  return { errorMessage, kind: "failed", lastScannedAt: null };
}

const permission: SourceStatus = { errorMessage: "EACCES", kind: "permission", lastScannedAt: null };

function source(name: string, status: SourceStatus, id = 1): LibrarySource {
  return { id, path: `/music/${name}`, status };
}

function library(sources: LibrarySource[], tracks: Track[] = []): MusicLibrary {
  return { kind: "library", playlists: [], sources, tracks };
}

function track(id: number, unavailableReason: TrackUnavailableReason | null = null): Track {
  return {
    addedAt: id,
    album: null,
    albumArtists: [],
    artists: [],
    artworkUrl: null,
    available: unavailableReason === null,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "WAV",
    genres: [],
    id,
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: `Track ${id}`,
    trackNumber: null,
    trackTotal: null,
    unavailableReason,
    url: `lume://app/media/${id}`,
    year: null,
  };
}

describe("folder rows", () => {
  it.each([
    {
      status: off,
      row: { enabled: false, hasIssue: false, scanLabel: null, statusText: "Off" },
      tooltip: undefined,
      trackCountText: null,
    },
    {
      status: unscanned,
      row: { enabled: true, hasIssue: false, scanLabel: "Rescan", statusText: "Not scanned yet" },
      tooltip: undefined,
      trackCountText: null,
    },
    {
      status: scanned(5 * minute, 0),
      row: { enabled: true, hasIssue: false, scanLabel: "Rescan", statusText: "No audio found" },
      tooltip: undefined,
      trackCountText: "0",
    },
    {
      status: scanned(30_000),
      row: { enabled: true, hasIssue: false, scanLabel: "Rescan", statusText: "Scanned just now" },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(minute),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: "Scanned 1 minute ago",
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(5 * minute),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: "Scanned 5 minutes ago",
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(hour),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: "Scanned 1 hour ago",
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(3 * hour),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: "Scanned 3 hours ago",
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(3 * day),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: `Scanned ${shortDate.format(now - 3 * day)}`,
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: scanned(now - lastYear),
      row: {
        enabled: true,
        hasIssue: false,
        scanLabel: "Rescan",
        statusText: `Scanned ${shortDateWithYear.format(lastYear)}`,
      },
      tooltip: undefined,
      trackCountText: "12",
    },
    {
      status: missing(now - 2 * hour),
      row: {
        enabled: true,
        hasIssue: true,
        scanLabel: "Scan again",
        statusText: "Not connected · last scanned 2 hours ago",
      },
      tooltip: missingDetail,
      trackCountText: null,
    },
    {
      status: missing(null),
      row: { enabled: true, hasIssue: true, scanLabel: "Scan again", statusText: "Not connected" },
      tooltip: missingDetail,
      trackCountText: null,
    },
    {
      status: permission,
      row: {
        enabled: true,
        hasIssue: true,
        scanLabel: "Scan again",
        statusText: `Couldn’t scan · ${permissionCopy}`,
      },
      tooltip: permissionCopy,
      trackCountText: null,
    },
    {
      status: failed("Disk read failed"),
      row: {
        enabled: true,
        hasIssue: true,
        scanLabel: "Scan again",
        statusText: "Couldn’t scan · Disk read failed",
      },
      tooltip: "Disk read failed",
      trackCountText: null,
    },
    {
      status: failed(""),
      row: {
        enabled: true,
        hasIssue: true,
        scanLabel: "Scan again",
        statusText: "Couldn’t scan · Unknown scan error.",
      },
      tooltip: "Unknown scan error.",
      trackCountText: null,
    },
  ])("shows $row.statusText", ({ row, status, tooltip, trackCountText }) => {
    expect(presentLibrarySources(library([source("a", status)]), idle, now).folders).toStrictEqual([
      { ...row, id: 1, name: "a", path: "/music/a", scanning: false, tooltip, trackCountText },
    ]);
  });
});

describe("tracks notice", () => {
  it.each([
    { case: "no folders", sources: [], tracks: [], notice: { kind: "none" } },
    {
      case: "healthy folders",
      sources: [source("a", scanned(minute))],
      tracks: [track(1)],
      notice: { kind: "none" },
    },
    {
      case: "the first failing folder, in folder order",
      sources: [
        source("a", scanned(minute), 1),
        source("b", missing(hour), 2),
        source("c", failed("Disk read failed"), 3),
      ],
      tracks: [track(1, "source-missing"), track(2, "file-missing")],
      notice: {
        detail: "Its tracks can’t play until it’s back.",
        kind: "issue", scanning: false,
        sourceId: 2,
        title: "b isn’t connected",
      },
    },
    {
      case: "a folder that could not be read",
      sources: [source("c", failed("Disk read failed"), 3), source("b", missing(hour), 2)],
      tracks: [],
      notice: {
        detail: "Disk read failed",
        kind: "issue", scanning: false,
        sourceId: 3,
        title: "c couldn’t be scanned",
      },
    },
    {
      case: "a folder without permission",
      sources: [source("d", permission, 4)],
      tracks: [],
      notice: {
        detail: permissionCopy,
        kind: "issue", scanning: false,
        sourceId: 4,
        title: "d couldn’t be scanned",
      },
    },
    {
      case: "every folder off",
      sources: [source("a", off, 1), source("b", off, 2)],
      tracks: [track(1, "source-off")],
      notice: { kind: "off", title: "All folders are off" },
    },
    {
      case: "nothing for an off folder's tracks while another folder is on",
      sources: [source("a", off, 1), source("b", scanned(minute), 2)],
      tracks: [track(1, "source-off"), track(2)],
      notice: { kind: "none" },
    },
    {
      case: "one missing file",
      sources: [source("a", scanned(minute))],
      tracks: [track(1, "file-missing"), track(2)],
      notice: {
        detail: "Their files were moved or deleted since the last scan.",
        kind: "missing-files", scanning: false,
        title: "1 track is missing",
      },
    },
    {
      case: "missing files while another folder is off",
      sources: [source("a", off, 1), source("b", scanned(minute), 2)],
      tracks: [track(1, "source-off"), track(2, "file-missing"), track(3, "file-missing")],
      notice: {
        detail: "Their files were moved or deleted since the last scan.",
        kind: "missing-files", scanning: false,
        title: "2 tracks are missing",
      },
    },
    {
      case: "nothing for the tracks of forgotten folders",
      sources: [],
      tracks: [track(1, "source-forgotten"), track(2, "source-forgotten")],
      notice: { kind: "none" },
    },
  ])("shows $case", ({ notice, sources, tracks }) => {
    expect(presentLibrarySources(library(sources, tracks), idle, now).notice).toStrictEqual(notice);
  });
});

describe("sidebar footer", () => {
  it.each([
    { case: "no folders", sources: [], text: "No folders" },
    { case: "an unscanned folder", sources: [source("a", unscanned)], text: "a" },
    {
      case: "a recent scan",
      sources: [source("a", scanned(30_000))],
      text: "a · scanned just now",
    },
    { case: "minutes", sources: [source("a", scanned(5 * minute))], text: "a · scanned 5m" },
    { case: "hours", sources: [source("a", scanned(3 * hour))], text: "a · scanned 3h" },
    {
      case: "days",
      sources: [source("a", scanned(3 * day))],
      text: `a · scanned ${shortDate.format(now - 3 * day)}`,
    },
    { case: "one folder off", sources: [source("a", off)], text: "a · off" },
    {
      case: "every folder off",
      sources: [source("a", off, 1), source("b", off, 2)],
      text: "2 folders · all off",
    },
    {
      case: "one issue",
      sources: [source("a", scanned(minute), 1), source("b", missing(hour), 2)],
      text: "2 folders · 1 issue",
    },
    {
      case: "several issues",
      sources: [source("a", permission, 1), source("b", failed(""), 2)],
      text: "2 folders · 2 issues",
    },
    {
      case: "the oldest scan of the folders that are on",
      sources: [
        source("a", scanned(5 * minute), 1),
        source("b", scanned(3 * hour), 2),
        source("c", off, 3),
      ],
      text: "3 folders · scanned 3h",
    },
  ])("shows $case", ({ sources, text }) => {
    expect(presentLibrarySources(library(sources), idle, now).footer.text).toBe(text);
  });

  it("lists every folder path in its tooltip", () => {
    expect(presentLibrarySources(library([]), idle, now).footer.tooltip).toBeUndefined();
    expect(
      presentLibrarySources(library([source("a", off, 1), source("b", unscanned, 2)]), idle, now).footer
        .tooltip,
    ).toBe("/music/a\n/music/b");
  });
});

describe("tracks empty state", () => {
  const addMusic = {
    chooseLabel: "Choose folder",
    description: "Choose a folder of audio files. Lume plays them where they are.",
    kind: "add", scanning: false,
    title: "Add your music",
  };

  it.each([
    { case: "no folders", sources: [], tracks: [], empty: addMusic },
    { case: "an unscanned folder", sources: [source("a", unscanned)], tracks: [], empty: addMusic },
    {
      case: "the first scanned folder with no audio",
      sources: [source("a", unscanned, 1), source("quiet", scanned(minute, 0), 2)],
      tracks: [],
      empty: {
        chooseLabel: "Choose another folder",
        description: "Lume plays FLAC, M4A, MP3, AAC, OGG, OPUS and WAV files.",
        kind: "no-audio", scanning: false,
        sourceId: 2,
        title: "No audio in “quiet”",
      },
    },
    {
      case: "add music after every folder is forgotten",
      sources: [],
      tracks: [track(1, "source-forgotten")],
      empty: addMusic,
    },
    {
      case: "nothing once tracks exist",
      sources: [source("a", scanned(minute))],
      tracks: [track(1, "file-missing")],
      empty: { kind: "hidden" },
    },
    {
      case: "nothing while a folder is off",
      sources: [source("a", off)],
      tracks: [],
      empty: { kind: "hidden" },
    },
    {
      case: "nothing while a folder fails",
      sources: [source("a", scanned(minute, 0), 1), source("b", failed(""), 2)],
      tracks: [],
      empty: { kind: "hidden" },
    },
  ])("shows $case", ({ empty, sources, tracks }) => {
    expect(presentLibrarySources(library(sources, tracks), idle, now).empty).toStrictEqual(empty);
  });
});


describe("while main scans a folder", () => {
  const scanningA = new Set([1]);

  it("shows the row scanning and keeps its last track count", () => {
    const [row] = presentLibrarySources(
      library([source("a", scanned(hour, 40))]),
      scanningA,
      now,
    ).folders;

    expect(row).toMatchObject({ scanning: true, statusText: "Scanning…", trackCountText: "40" });
  });

  it("keeps a folder's issue notice and marks its scan as running", () => {
    const sources = [source("a", missing(hour))];

    expect(presentLibrarySources(library(sources), scanningA, now).notice).toMatchObject({
      kind: "issue",
      scanning: true,
      title: "a isn’t connected",
    });
    expect(presentLibrarySources(library(sources), scanningA, now).folders[0]).toMatchObject({
      hasIssue: false,
      statusText: "Scanning…",
    });
  });

  it("says scanning in the footer before the last scan age", () => {
    const sources = [source("a", scanned(3 * hour), 1), source("b", scanned(hour), 2)];

    expect(presentLibrarySources(library(sources), scanningA, now).footer.text).toBe(
      "2 folders · scanning",
    );
  });

  it("marks the empty state busy while a first folder scans", () => {
    expect(
      presentLibrarySources(library([source("a", unscanned)]), scanningA, now).empty,
    ).toMatchObject({ kind: "add", scanning: true });
  });

  it("ignores a scan reported for a folder that is off", () => {
    const [row] = presentLibrarySources(library([source("a", off)]), scanningA, now).folders;

    expect(row).toMatchObject({ scanning: false, statusText: "Off" });
  });
});
