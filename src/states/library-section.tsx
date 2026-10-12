import type { LibrarySource, MusicLibrary } from "../../shared/lib";
import { LibraryOnboarding } from "@/components/library-onboarding";
import { Button } from "@/components/ui/button";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext } from "@/hooks/use-playback";
import { TracksPage } from "@/pages/tracks";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { paper } from "@/states/paper-values";
import { idlePlayback } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

const music: LibrarySource = {
  enabled: true,
  id: 1,
  lastScanError: null,
  lastScannedAt: Date.parse("2026-10-11T12:00:00Z"),
  path: "/Users/lume/Music",
  trackCount: 6,
};

const tracks = [
  componentStateTracks.default,
  componentStateTracks.hover,
  componentStateTracks.focus,
  roughDataTracks[0]!,
  roughDataTracks[1]!,
  roughDataTracks[2]!,
].map((track, index) => toTrack(track, index + 1));

const unavailableTracks = tracks.map((track) => ({ ...track, available: false }));

function libraryWith(sources: LibrarySource[], libraryTracks = tracks): MusicLibrary {
  return { kind: "library", playlists: [], sources, tracks: libraryTracks };
}

const libraries = {
  allOff: libraryWith([{ ...music, enabled: false, trackCount: 0 }], unavailableTracks),
  disconnected: libraryWith(
    [
      music,
      {
        ...music,
        id: 2,
        lastScanError: "ENOENT: no such file or directory, scandir '/Volumes/Archive'",
        path: "/Volumes/Archive",
        trackCount: 0,
      },
    ],
    [...tracks, ...unavailableTracks.slice(0, 2).map((track) => ({ ...track, id: track.id + 10 }))],
  ),
  normal: libraryWith([music]),
  unavailable: libraryWith(
    [music],
    [...tracks, ...unavailableTracks.slice(0, 2).map((track) => ({ ...track, id: track.id + 10 }))],
  ),
};

/** The real Tracks page in an excerpt as tall as frame 09's, so its list renders virtualized. */
function TracksPageSpecimen({ library }: { library: MusicLibrary }) {
  return (
    <div className="flex h-60 w-[1216px] flex-col overflow-hidden rounded-lg inset-ring inset-ring-default">
      <MusicLibraryContext.Provider value={library}>
        <PlaybackContext.Provider value={idlePlayback}>
          <TracksPage />
        </PlaybackContext.Provider>
      </MusicLibraryContext.Provider>
    </div>
  );
}

const headerParts: PartSpec[] = [
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
    name: "stat line",
    paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
    selector: "header h1 + p",
  },
  {
    name: "filter",
    paper: {
      backgroundColor: paper.neutral900,
      borderRadius: 6,
      edge: `1px ${paper.neutral800}`,
      height: 32,
      width: 224,
    },
    selector: "header [data-slot=input-group]",
  },
  {
    name: "sort",
    paper: {
      color: paper.neutral400,
      fontSize: 13,
      fontWeight: 400,
      height: 32,
      lineHeight: 16,
      paddingLeft: 8,
      paddingRight: 6,
    },
    selector: "header [data-slot=dropdown-menu-trigger]",
  },
  {
    name: "sort caret",
    paper: { height: 12, width: 12 },
    selector: "header [data-slot=dropdown-menu-trigger] svg",
  },
  { name: "column header", paper: { height: 32 }, selector: "thead th:first-child" },
];

function noticeParts(dot: string, hasDetail: boolean): PartSpec[] {
  return [
    {
      name: "notice",
      paper: {
        backgroundColor: paper.neutral900,
        borderRadius: 8,
        edge: `1px ${paper.neutral800}`,
        height: 48,
        left: 8,
        paddingLeft: 16,
        paddingRight: 16,
        width: 1200,
      },
      selector: "[data-slot=library-notice] > div",
    },
    {
      name: "dot",
      paper: { backgroundColor: dot, borderRadius: 3, height: 6, left: 24, width: 6 },
      selector: "[data-slot=library-notice] > div > span",
    },
    {
      name: "title",
      paper: { color: paper.neutral100, fontSize: 13, fontWeight: 500, left: 42, lineHeight: 16 },
      selector: "[data-slot=library-notice] p > span:first-child",
    },
    ...(hasDetail
      ? [
          {
            name: "detail",
            paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
            selector: "[data-slot=library-notice] p > span:nth-child(2)",
          },
        ]
      : []),
    {
      name: "action",
      paper: { borderRadius: 4, fontSize: 12, fontWeight: 500, height: 24, lineHeight: 16 },
      selector: "[data-slot=library-notice] [data-slot=button]",
    },
  ];
}

function onboardingParts(button: string): PartSpec[] {
  return [
    { name: "block", paper: { width: 400 }, selector: "[data-slot=library-onboarding]" },
    {
      name: "glyph",
      paper: { height: 24, left: 0, width: 198 },
      selector: "[data-slot=scan-glyph]",
    },
    {
      name: "title",
      paper: {
        color: paper.neutral100,
        fontSize: 24,
        fontWeight: 600,
        left: 0,
        letterSpacing: -0.48,
        lineHeight: 32,
      },
      selector: "h1",
    },
    {
      name: "description",
      paper: { color: paper.neutral400, fontSize: 13, lineHeight: 20 },
      selector: "h1 + p",
    },
    {
      name: "action",
      paper: {
        backgroundColor: button,
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        height: 32,
        lineHeight: 16,
        paddingLeft: 12,
        paddingRight: 12,
      },
      selector: "[data-slot=button]",
    },
  ];
}

export function LibrarySection() {
  return (
    <Section
      description="Frames 07, 07b, 08 and 09. The page excerpts are the real Tracks page over fixture libraries."
      title="Library"
    >
      <Specimen id="library.header" label="Page header (08)" parts={headerParts}>
        <TracksPageSpecimen library={libraries.normal} />
      </Specimen>
      <Specimen
        id="library.notice.disconnected"
        label="A · Folder not connected"
        parts={noticeParts(paper.red400, true)}
      >
        <TracksPageSpecimen library={libraries.disconnected} />
      </Specimen>
      <Specimen
        id="library.notice.all-off"
        label="B · All folders off"
        parts={noticeParts(paper.neutral500, false)}
      >
        <TracksPageSpecimen library={libraries.allOff} />
      </Specimen>
      <Specimen
        id="library.notice.unavailable"
        label="C · Unavailable tracks"
        parts={noticeParts(paper.neutral500, true)}
      >
        <TracksPageSpecimen library={libraries.unavailable} />
      </Specimen>
      <Specimen
        id="library.onboarding"
        label="First run (07)"
        parts={onboardingParts(paper.neutral100)}
      >
        <LibraryOnboarding
          actions={
            <Button type="button" variant="primary">
              Choose folder…
            </Button>
          }
          description="Choose a folder of audio files. Lume plays them where they are."
          title="Add your music"
        />
      </Specimen>
      <Specimen
        id="library.onboarding.busy"
        label="A · Picker open (07b)"
        parts={[
          ...onboardingParts(paper.neutral100).slice(0, 4),
          {
            name: "action",
            paper: { height: 32, opacity: 0.4 },
            selector: "[data-slot=button]",
          },
        ]}
      >
        <LibraryOnboarding
          actions={
            <Button busy type="button" variant="primary">
              Choose folder…
            </Button>
          }
          busy
          description="Choose a folder of audio files. Lume plays them where they are."
          title="Add your music"
        />
      </Specimen>
      <Specimen
        id="library.onboarding.error"
        label="B · Can’t read folder (07b)"
        parts={[
          ...onboardingParts(paper.neutral100),
          {
            name: "error",
            paper: { color: paper.red300, fontSize: 12, left: 0, lineHeight: 16 },
            selector: "[role=alert]",
          },
          {
            name: "error dot",
            paper: { backgroundColor: paper.red400, height: 6, width: 6 },
            selector: "[role=alert] > span",
          },
        ]}
      >
        <LibraryOnboarding
          actions={
            <Button type="button" variant="primary">
              Choose folder…
            </Button>
          }
          description="Choose a folder of audio files. Lume plays them where they are."
          errorMessage="Lume needs permission to read “Music”."
          title="Add your music"
        />
      </Specimen>
      <Specimen
        id="library.onboarding.empty"
        label="C · No audio found (07b)"
        parts={[
          ...onboardingParts(paper.neutral100),
          {
            name: "second action",
            paper: { backgroundColor: paper.neutral800, color: paper.neutral100, height: 32 },
            selector: "[data-slot=button]:nth-child(2)",
          },
        ]}
      >
        <LibraryOnboarding
          actions={
            <>
              <Button type="button" variant="primary">
                Choose another folder…
              </Button>
              <Button type="button">Scan again</Button>
            </>
          }
          description="Lume plays FLAC, M4A, MP3, AAC, OGG, OPUS and WAV files."
          title="No audio in “Music”"
        />
      </Specimen>
    </Section>
  );
}
