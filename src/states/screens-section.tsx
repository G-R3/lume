import type { ReactNode } from "react";
import type { LibrarySource, MusicLibrary, PlaylistDetails } from "../../shared/lib";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext } from "@/hooks/use-playback";
import { PlaylistContent, PlaylistPageSkeleton } from "@/pages/playlist";
import { FolderSettings } from "@/pages/settings/folders";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { paper } from "@/states/paper-values";
import { idlePlayback, type PlaybackValue } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

const tracks = [
  componentStateTracks.default,
  componentStateTracks.hover,
  componentStateTracks.playing,
  componentStateTracks.unavailable,
  roughDataTracks[0]!,
].map((track, index) => toTrack(track, index + 1));

const nightDrive: PlaylistDetails = {
  description: "City pop and slow synths for the last hour of the road.",
  id: 1,
  title: "Night Drive",
  tracks: tracks.map((track, index) => ({ id: index + 1, position: index, trackId: track.id })),
};

const rainySunday: PlaylistDetails = {
  description: null,
  id: 2,
  title: "Rainy Sunday",
  tracks: [],
};

const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;

const folder: LibrarySource = {
  enabled: true,
  id: 1,
  lastScanError: null,
  lastScannedAt: minutesAgo(2),
  path: "/Users/lume/Music",
  trackCount: 1284,
};

const folders: LibrarySource[] = [
  folder,
  {
    ...folder,
    id: 2,
    lastScanError: "ENOENT: no such file or directory, scandir '/Volumes/Archive'",
    lastScannedAt: Date.parse("2026-10-02T12:00:00Z"),
    path: "/Volumes/Archive",
    trackCount: 0,
  },
  { ...folder, id: 3, path: "/Users/lume/Documents/Voice memos", trackCount: 0 },
  { ...folder, enabled: false, id: 4, path: "/Users/lume/Music/iTunes (old)", trackCount: 0 },
  { ...folder, id: 5, path: "/Users/lume/Downloads/Bandcamp", trackCount: 212 },
];

function library(sources: LibrarySource[] = [folder]): MusicLibrary {
  return { kind: "library", playlists: [], sources, tracks };
}

const playingFromHere: PlaybackValue = {
  ...idlePlayback,
  activeSourceEntryId: 3,
  activeSourcePlaylistId: 1,
  isPlaying: true,
};

/** A page excerpt at frame 10's width, as tall as `height`. */
function PageSpecimen({
  children,
  height,
  playback = idlePlayback,
  sources,
}: {
  children: ReactNode;
  height: string;
  playback?: PlaybackValue;
  sources?: LibrarySource[];
}) {
  return (
    <div
      className="flex w-[1216px] flex-col overflow-hidden rounded-lg inset-ring inset-ring-default"
      style={{ height }}
    >
      <MusicLibraryContext.Provider value={library(sources)}>
        <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>
      </MusicLibraryContext.Provider>
    </div>
  );
}

const playlistHeaderParts: PartSpec[] = [
  { name: "header", paper: { height: 88, width: 1216 }, selector: "header" },
  {
    name: "cover",
    paper: { borderRadius: 6, height: 56, left: 24, paddingLeft: 6, width: 56 },
    selector: "[data-slot=playlist-cover]",
  },
  {
    name: "initials",
    paper: {
      color: paper.neutral100,
      fontFamily: "mono",
      fontSize: 12,
      fontWeight: 700,
      left: 30,
      letterSpacing: 0.48,
      lineHeight: 16,
    },
    selector: "[data-slot=playlist-cover] > span",
  },
  {
    name: "title",
    paper: {
      color: paper.neutral100,
      fontSize: 24,
      fontWeight: 600,
      left: 96,
      letterSpacing: -0.48,
      lineHeight: 32,
    },
    selector: "header h1",
  },
  {
    name: "description",
    paper: { color: paper.neutral400, fontSize: 13, left: 96, lineHeight: 16 },
    selector: "header h1 + p > span:first-child",
  },
  {
    name: "stat line",
    paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
    selector: "header h1 + p > span:last-child",
  },
  {
    name: "play",
    paper: {
      backgroundColor: paper.neutral100,
      borderRadius: 6,
      color: paper.neutral950,
      fontSize: 13,
      fontWeight: 500,
      height: 32,
      lineHeight: 16,
      paddingLeft: 10,
      paddingRight: 12,
    },
    selector: "[role=group] > [data-slot=button]:nth-child(1)",
  },
  {
    name: "play icon",
    paper: { height: 14, width: 14 },
    selector: "[role=group] > [data-slot=button]:nth-child(1) svg",
  },
  {
    name: "shuffle",
    paper: {
      backgroundColor: paper.neutral800,
      color: paper.neutral100,
      height: 32,
      paddingLeft: 10,
      paddingRight: 12,
    },
    selector: "[role=group] > [data-slot=button]:nth-child(2)",
  },
  {
    name: "more",
    paper: { borderRadius: 6, color: paper.neutral400, height: 32, width: 32 },
    selector: "[role=group] [data-slot=dropdown-menu-trigger]",
  },
  { name: "column header", paper: { height: 32 }, selector: "thead th:first-child" },
  { name: "row", paper: { height: 40 }, selector: "tbody tr[data-entry-id]" },
  {
    name: "playing row",
    paper: { backgroundColor: paper.accent10 },
    selector: "tbody tr[aria-current] td:first-child",
  },
];

const playlistEmptyParts: PartSpec[] = [
  { name: "play", paper: { opacity: 0.4 }, selector: "[role=group] > [data-slot=button]" },
  {
    name: "shuffle",
    paper: { opacity: 0.4 },
    selector: "[role=group] > [data-slot=button]:nth-child(2)",
  },
  { name: "block", paper: { left: 408, width: 400 }, selector: "[data-slot=playlist-empty]" },
  {
    name: "title",
    paper: {
      color: paper.neutral100,
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: -0.15,
      lineHeight: 20,
    },
    selector: "[data-slot=playlist-empty] h2",
  },
  {
    name: "description",
    paper: { color: paper.neutral400, fontSize: 13, lineHeight: 20 },
    selector: "[data-slot=playlist-empty] p",
  },
  {
    name: "action",
    paper: {
      backgroundColor: paper.neutral800,
      borderRadius: 6,
      color: paper.neutral100,
      fontSize: 13,
      fontWeight: 500,
      height: 32,
      paddingLeft: 12,
      paddingRight: 12,
    },
    selector: "[data-slot=playlist-empty] a",
  },
];

const playlistLoadingParts: PartSpec[] = [
  {
    name: "cover",
    paper: { backgroundColor: paper.neutral900, borderRadius: 6, height: 56, left: 24, width: 56 },
    selector: "header > span:first-child",
  },
  {
    name: "title bar",
    paper: { backgroundColor: paper.neutral900, borderRadius: 4, height: 16, left: 96, width: 200 },
    selector: "header > span:nth-child(2) > span:first-child",
  },
  {
    name: "detail bar",
    paper: { backgroundColor: paper.neutral900, borderRadius: 2, height: 8, width: 320 },
    selector: "header > span:nth-child(2) > span:last-child",
  },
  { name: "column header", paper: { height: 32 }, selector: "thead th:first-child" },
  { name: "row", paper: { height: 40 }, selector: "tbody tr" },
  {
    name: "artwork",
    paper: { backgroundColor: paper.neutral900, borderRadius: 4, height: 32, left: 64, width: 32 },
    selector: "tbody tr td:nth-child(2) span",
  },
  { name: "last row", paper: { opacity: 0.15 }, selector: "tbody tr:last-child" },
];

const row = (index: number) => `tbody tr:nth-child(${index})`;

const settingsParts: PartSpec[] = [
  { name: "header", paper: { height: 56, width: 1216 }, selector: "header" },
  {
    name: "title",
    paper: {
      color: paper.neutral100,
      fontSize: 15,
      fontWeight: 600,
      left: 24,
      letterSpacing: -0.15,
      lineHeight: 20,
    },
    selector: "header h1",
  },
  {
    name: "add folder",
    paper: {
      backgroundColor: paper.neutral100,
      borderRadius: 6,
      color: paper.neutral950,
      fontSize: 13,
      fontWeight: 500,
      height: 32,
      paddingLeft: 10,
      paddingRight: 12,
    },
    selector: "header [data-slot=button]",
  },
  { name: "add icon", paper: { height: 14, width: 14 }, selector: "header [data-slot=button] svg" },
  {
    name: "column header",
    paper: {
      color: paper.neutral400,
      fontFamily: "mono",
      fontSize: 12,
      height: 32,
      letterSpacing: 0.96,
      lineHeight: 16,
    },
    selector: "thead th:first-child",
  },
  {
    name: "row (hover)",
    paper: { backgroundColor: paper.neutral850, borderRadius: 6, height: 40, left: 8 },
    selector: `${row(1)} td:first-child`,
  },
  {
    name: "folder tile",
    paper: {
      backgroundColor: paper.neutral900,
      borderRadius: 4,
      edge: `1px ${paper.neutral800}`,
      height: 32,
      left: 24,
      width: 32,
    },
    selector: `${row(1)} td:first-child > div > span`,
  },
  {
    name: "folder icon",
    paper: { color: paper.neutral400, height: 16, width: 16 },
    selector: `${row(1)} td:first-child svg`,
  },
  {
    name: "name",
    paper: { color: paper.neutral100, fontSize: 13, fontWeight: 500, left: 64, lineHeight: 16 },
    selector: `${row(1)} td:first-child p:first-child`,
  },
  {
    name: "path",
    paper: { color: paper.neutral400, fontFamily: "mono", fontSize: 12, lineHeight: 16 },
    selector: `${row(1)} td:first-child p:last-child`,
  },
  {
    name: "status dot",
    paper: { backgroundColor: paper.neutral600, borderRadius: 3, height: 6, width: 6 },
    selector: `${row(1)} td:nth-child(2) p > span:first-child`,
  },
  {
    name: "status",
    paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
    selector: `${row(1)} td:nth-child(2) p > span:last-child`,
  },
  {
    name: "count",
    paper: { color: paper.neutral400, fontFamily: "mono", fontSize: 12, lineHeight: 16 },
    selector: `${row(1)} td:nth-child(3)`,
  },
  {
    name: "rescan (hover)",
    paper: { borderRadius: 4, fontSize: 12, fontWeight: 500, height: 24, opacity: 1 },
    selector: `${row(1)} td:nth-child(4) [data-slot=button]:first-child`,
  },
  {
    name: "more (hover)",
    paper: { height: 24, opacity: 1, width: 24 },
    selector: `${row(1)} td:nth-child(4) [data-slot=dropdown-menu-trigger]`,
  },
  {
    name: "switch",
    paper: { backgroundColor: paper.neutral100, borderRadius: 8, height: 16, width: 28 },
    selector: `${row(1)} [role=switch]`,
  },
  {
    name: "not connected dot",
    paper: { backgroundColor: paper.red400 },
    selector: `${row(2)} td:nth-child(2) p > span:first-child`,
  },
  {
    name: "not connected",
    paper: { color: paper.neutral100, fontSize: 12, lineHeight: 16 },
    selector: `${row(2)} td:nth-child(2) p > span:last-child`,
  },
  {
    name: "scan again",
    paper: {
      backgroundColor: paper.neutral800,
      borderRadius: 4,
      color: paper.neutral100,
      fontSize: 12,
      fontWeight: 500,
      height: 24,
      paddingLeft: 8,
      paddingRight: 8,
    },
    selector: `${row(2)} td:nth-child(4) [data-slot=button]:first-child`,
  },
  {
    name: "rescan (no audio)",
    paper: { color: paper.neutral400, opacity: 1 },
    selector: `${row(3)} td:nth-child(4) [data-slot=button]:first-child`,
  },
  {
    name: "rescan (rest)",
    paper: { color: paper.neutral400, opacity: 1 },
    selector: `${row(5)} td:nth-child(4) [data-slot=button]:first-child`,
  },
  {
    name: "more (rest)",
    paper: { opacity: 0 },
    selector: `${row(3)} td:nth-child(4) [data-slot=dropdown-menu-trigger]`,
  },
  {
    name: "off name",
    paper: { color: paper.neutral500 },
    selector: `${row(4)} td:first-child p:first-child`,
  },
  {
    name: "off path",
    paper: { color: paper.neutral450 },
    selector: `${row(4)} td:first-child p:last-child`,
  },
  { name: "off icon", paper: { opacity: 0.4 }, selector: `${row(4)} td:first-child svg` },
  {
    name: "off switch",
    paper: { backgroundColor: paper.neutral700 },
    selector: `${row(4)} [role=switch]`,
  },
];

export function ScreensSection() {
  return (
    <Section
      description="Frames 10, 11 and 14. The excerpts are the real playlist and Folders pages over fixture data."
      title="Playlist and settings"
    >
      <Specimen
        force={{ selector: "tbody tr[data-entry-id]:nth-child(2)", states: ["hover"] }}
        id="playlist.header"
        label="Playing from here (10)"
        parts={playlistHeaderParts}
      >
        <PageSpecimen height="300px" playback={playingFromHere}>
          <PlaylistContent playlist={nightDrive} />
        </PageSpecimen>
      </Specimen>
      <Specimen id="playlist.empty" label="A · Empty playlist (11)" parts={playlistEmptyParts}>
        <PageSpecimen height="480px">
          <PlaylistContent playlist={rainySunday} />
        </PageSpecimen>
      </Specimen>
      <Specimen id="playlist.loading" label="B · Loading (11)" parts={playlistLoadingParts}>
        <PageSpecimen height="400px">
          <PlaylistPageSkeleton />
        </PageSpecimen>
      </Specimen>
      <Specimen
        force={{ selector: row(1), states: ["hover"] }}
        id="settings.folders"
        label="Folders (14)"
        parts={settingsParts}
      >
        <PageSpecimen height="360px" sources={folders}>
          <FolderSettings library={library(folders)} />
        </PageSpecimen>
      </Specimen>
    </Section>
  );
}
