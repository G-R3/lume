import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext } from "@/hooks/use-playback";
import type { QueueItem, SourceRef } from "@/lib/queue/model";
import { QueuePanel } from "@/pages/layout/queue-sidebar";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { insetFocusRing, paper } from "@/states/paper-values";
import { idlePlayback, type PlaybackValue } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

const tracks = [
  componentStateTracks.playing,
  componentStateTracks.selected,
  componentStateTracks.hover,
  componentStateTracks.focus,
  componentStateTracks.default,
  componentStateTracks.unavailable,
  roughDataTracks[0]!,
  roughDataTracks[1]!,
  roughDataTracks[2]!,
].map((track, index) => toTrack(track, index + 1));

const library = { kind: "library" as const, playlists: [], sources: [], tracks };

const manual = (trackId: number): QueueItem => ({
  origin: { kind: "manual" },
  queueItemId: `manual-${trackId}`,
  trackId,
});

const fromSource = (trackId: number): QueueItem => ({
  origin: {
    kind: "source",
    sessionId: "fixture",
    source: { kind: "playlist", playlistId: 1 },
    sourceEntryId: trackId,
  },
  queueItemId: `source-${trackId}`,
  trackId,
});

type QueueView = NonNullable<PlaybackValue["queue"]>;

const nightDrive: SourceRef = { kind: "playlist", playlistId: 1, title: "Night Drive" };

const playingQueue: QueueView = {
  current: { item: fromSource(1), lane: "source", participatesInSourceNavigation: true },
  manualQueue: [manual(2), manual(3), manual(4)],
  source: nightDrive,
  sourceQueue: [5, 6, 7, 8, 9].map(fromSource),
  status: "playing",
};

function QueueSpecimen({
  isPlaying = true,
  queue,
  visibleRows,
}: {
  isPlaying?: boolean;
  queue: QueueView | null;
  visibleRows?: number;
}) {
  return (
    <div className="flex w-80 flex-col border-l border-separator bg-raised">
      <MusicLibraryContext.Provider value={library}>
        <PlaybackContext.Provider value={{ ...idlePlayback, isPlaying, queue }}>
          <QueuePanel visibleRows={visibleRows} />
        </PlaybackContext.Provider>
      </MusicLibraryContext.Provider>
    </div>
  );
}

// Lefts are measured from the panel's outer edge, which includes its 1px left border (as in Paper).
const selectors = {
  current: "[data-slot=queue-current]",
  manualRow: (index: number) => `[data-sidebar=group]:nth-child(2) li:nth-child(${index})`,
  sourceRow: (index: number) => `[data-sidebar=group]:nth-child(3) li:nth-child(${index})`,
};

const title = {
  color: paper.neutral100,
  fontFamily: "sans",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 16,
} as const;

const meta = { color: paper.neutral400, fontFamily: "sans", fontSize: 12, lineHeight: 16 } as const;

function rowParts(name: string, row: string, background: string): PartSpec[] {
  return [
    {
      name,
      paper: { backgroundColor: background, borderRadius: 8, height: 40, left: 13, width: 295 },
      selector: row,
    },
    {
      name: `${name} artwork`,
      paper: { borderRadius: 4, height: 32, left: 17, opacity: 1, width: 32 },
      selector: `${row} [data-slot=track-artwork]`,
    },
    {
      name: `${name} title`,
      paper: { ...title, left: 57 },
      selector: `${row} [data-slot=track-artwork] + span > span:first-child`,
    },
    {
      name: `${name} artist`,
      paper: { ...meta, fontWeight: 400 },
      selector: `${row} [data-slot=track-artwork] + span > span:last-child`,
    },
  ];
}

const openParts: PartSpec[] = [
  { name: "panel", paper: { backgroundColor: paper.neutral900, width: 320 }, selector: null },
  { name: "header", paper: { height: 56, paddingLeft: 16 }, selector: "div:has(> h2)" },
  {
    name: "title",
    paper: {
      color: paper.neutral100,
      fontFamily: "sans",
      fontSize: 15,
      fontWeight: 600,
      left: 17,
      letterSpacing: -0.15,
      lineHeight: 20,
    },
    selector: "h2",
  },
  { name: "stat line", paper: { ...meta, fontWeight: 400 }, selector: "h2 + p" },
  {
    name: "section",
    paper: { paddingLeft: 12, paddingRight: 12 },
    selector: "[data-sidebar=group]:nth-child(2)",
  },
  {
    name: "section label",
    paper: { ...meta, fontWeight: 500, height: 32, left: 13, paddingLeft: 4 },
    selector: "[data-sidebar=group]:nth-child(2) h3",
  },
  {
    name: "section count",
    paper: { ...meta, fontFamily: "mono" },
    selector: "[data-sidebar=group]:nth-child(2) h3 + span",
  },
  ...rowParts("now playing", selectors.current, paper.accent10),
  {
    name: "now playing meter",
    paper: { opacity: 1 },
    selector: `${selectors.current} [data-slot=artwork-state] > span > span:nth-last-child(2)`,
  },
  ...rowParts("row", selectors.manualRow(1), paper.transparent),
  {
    name: "row time",
    paper: { ...meta, fontFamily: "mono", width: 40 },
    selector: `${selectors.manualRow(1)} [data-slot=queue-time]`,
  },
  ...rowParts("hover row", selectors.manualRow(2), paper.neutral850),
  {
    name: "hover more",
    paper: { color: paper.neutral400, height: 24, opacity: 1, width: 24 },
    selector: `${selectors.manualRow(2)} > button:last-child`,
  },
  {
    name: "unavailable artwork",
    paper: { opacity: 0.4 },
    selector: `${selectors.sourceRow(2)} [data-slot=track-artwork]`,
  },
  {
    name: "unavailable title",
    paper: { ...title, color: paper.neutral600 },
    selector: `${selectors.sourceRow(2)} [data-slot=track-artwork] + span > span:first-child`,
  },
  {
    name: "unavailable label",
    paper: meta,
    selector: `${selectors.sourceRow(2)} [data-slot=track-artwork] + span + span`,
  },
  {
    name: "unavailable time",
    paper: { color: paper.neutral600, fontFamily: "mono" },
    selector: `${selectors.sourceRow(2)} [data-slot=queue-time]`,
  },
];

export function QueueSection() {
  return (
    <Section
      description="Frames 12 and 13. The app's queue panel under fixture playback."
      title="Queue panel"
    >
      <div className="grid grid-cols-2 gap-x-12 gap-y-8">
        <Specimen
          force={{ selector: selectors.manualRow(2), states: ["hover"] }}
          id="queue.open"
          label="Open, playing (12)"
          parts={openParts}
        >
          <QueueSpecimen queue={playingQueue} />
        </Specimen>
        <Specimen
          force={{
            selector: `${selectors.manualRow(1)} > button:first-child`,
            states: ["focus-visible"],
          }}
          id="queue.focus"
          label="Paused, row focus"
          parts={[
            ...rowParts("now playing", selectors.current, paper.accent10),
            {
              name: "now playing meter",
              paper: { opacity: 0 },
              selector: `${selectors.current} [data-slot=artwork-state] > span > span:nth-last-child(2)`,
            },
            {
              name: "focused row",
              paper: { borderRadius: 8, focusRing: insetFocusRing, height: 40 },
              selector: `${selectors.manualRow(1)} > button:first-child`,
            },
            {
              name: "focused more",
              paper: { opacity: 1 },
              selector: `${selectors.manualRow(1)} > button:last-child`,
            },
          ]}
        >
          <QueueSpecimen isPlaying={false} queue={{ ...playingQueue, status: "paused" }} />
        </Specimen>
        <Specimen
          id="queue.empty"
          label="Nothing queued (13 A)"
          parts={[
            {
              name: "title",
              paper: { ...title, left: 17 },
              selector: "[data-slot=sidebar-content] p:first-child",
            },
            {
              name: "hint",
              paper: { ...meta, left: 17 },
              selector: "[data-slot=sidebar-content] p + p",
            },
          ]}
        >
          <QueueSpecimen queue={null} />
        </Specimen>
        <Specimen
          id="queue.finished"
          label="Playback finished (13 B)"
          parts={[
            {
              name: "row",
              paper: { height: 40, left: 13, paddingLeft: 4 },
              selector: "[data-slot=queue-finished]",
            },
            {
              name: "tile",
              paper: {
                backgroundColor: paper.neutral800,
                borderRadius: 4,
                height: 32,
                left: 17,
                width: 32,
              },
              selector: "[data-slot=queue-finished] > span",
            },
            {
              name: "icon",
              paper: { color: paper.neutral400, height: 16, width: 16 },
              selector: "[data-slot=queue-finished] svg",
            },
            {
              name: "title",
              paper: { ...title, left: 57 },
              selector: "[data-slot=queue-finished] p",
            },
          ]}
        >
          <QueueSpecimen
            isPlaying={false}
            queue={{
              current: null,
              manualQueue: [],
              source: nightDrive,
              sourceQueue: [],
              status: "stopped",
            }}
          />
        </Specimen>
        <Specimen
          id="queue.detached"
          label="Playlist deleted (13 C)"
          parts={[
            {
              name: "note",
              paper: { ...meta, left: 13, paddingLeft: 4 },
              selector: "[data-sidebar=group]:nth-child(2) > p",
            },
            {
              name: "more",
              paper: { ...meta, fontWeight: 400, height: 32, left: 13, paddingLeft: 4 },
              selector: "[data-sidebar=group]:nth-child(2) > ul + p",
            },
          ]}
        >
          <QueueSpecimen
            visibleRows={3}
            queue={{
              ...playingQueue,
              manualQueue: [],
              source: { kind: "detached", title: "Night Drive" },
            }}
          />
        </Specimen>
      </div>
    </Section>
  );
}
