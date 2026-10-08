import { DotsThreeIcon, ShuffleAngularIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import type { Track } from "../../shared/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { PlaybackContext } from "@/hooks/use-playback";
import { TrackList } from "@/pages/tracks/track-list";
import {
  componentStateTracks,
  createArtworkDataUrl,
  type FixtureTrack,
  roughDataTracks,
} from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { Section, Specimen } from "@/states/specimen";

// Paper's literal values (frame 17 and 08c, read with get_jsx on October 8, 2026). They are
// written out instead of read from the app's tokens so a wrong token shows up as drift.
const paper = {
  accent10: "#EEBF5A1A",
  amber: "#EEBF5A",
  neutral50: "#FAFAFA",
  neutral100: "#F5F5F5",
  neutral400: "#A3A3A3",
  neutral500: "#737373",
  neutral600: "#525252",
  neutral700: "#404040",
  neutral750: "#333333",
  neutral800: "#262626",
  neutral850: "#1E1E1E",
  neutral950: "#0A0A0A",
  red350: "#FF7778",
  red400: "#FF6467",
  transparent: "transparent",
} as const;

const focusRing = `2px ${paper.neutral500} 2px`;

const insetFocusRing = `2px ${paper.neutral500} -2px`;

type PlaybackValue = NonNullable<ComponentProps<typeof PlaybackContext.Provider>["value"]>;

const noop = () => {};

const idlePlayback: PlaybackValue = {
  activeQueueItemId: null,
  activeSourceEntryId: null,
  activeSourcePlaylistId: null,
  activeTrack: null,
  applySourceChange: noop,
  canGoNext: false,
  duration: 0,
  enqueueTrack: noop,
  errorMessage: null,
  isInitialized: true,
  isMuted: false,
  isPlaying: false,
  jumpToQueueItem: noop,
  moveQueueItem: noop,
  next: noop,
  playSource: async () => {},
  playSourceEntry: async () => {},
  previous: noop,
  queue: null,
  removeQueueItem: noop,
  seek: noop,
  setShuffleEnabled: noop,
  setVolume: noop,
  shuffleEnabled: false,
  shufflePlay: async () => {},
  syncLibrary: noop,
  toggleMute: noop,
  togglePlayback: noop,
  volume: 1,
};

function toTrack(fixture: FixtureTrack, id: number): Track {
  const artists = fixture.artists.length > 0 ? [...fixture.artists] : ["Unknown artist"];

  return {
    album: fixture.album ?? "Unknown album",
    albumArtists: artists,
    artists,
    artworkUrl: fixture.artwork ? createArtworkDataUrl(fixture.artwork) : null,
    available: fixture.available,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: fixture.duration,
    format: "FLAC",
    genres: [],
    id,
    likedAt: fixture.liked ? 1 : null,
    lossless: true,
    sampleRate: null,
    title: fixture.title ?? fixture.fileName,
    trackNumber: null,
    trackTotal: null,
    url: "",
    year: null,
  };
}

/** The app's track list with one row, under fixture playback state. */
function TrackRowSpecimen({
  playback = "idle",
  track,
}: {
  playback?: "idle" | "paused" | "playing";
  track: FixtureTrack;
}) {
  const value =
    playback === "idle"
      ? idlePlayback
      : { ...idlePlayback, activeSourceEntryId: 1, isPlaying: playback === "playing" };

  return (
    <div className="w-[1184px]">
      <PlaybackContext.Provider value={value}>
        <TrackList caption="Specimen" items={[{ sourceEntryId: 1, track: toTrack(track, 1) }]} />
      </PlaybackContext.Provider>
    </div>
  );
}

const rowSelectors = {
  album: "tbody tr td:nth-child(3) > div",
  artist: "tbody tr td:nth-child(2) button > span:nth-child(2) > span:nth-child(2)",
  artwork: "tbody tr td:nth-child(2) button > span:first-child",
  duration: "tbody tr td:nth-child(4)",
  heart: "tbody tr td:nth-child(5) svg",
  row: "tbody tr",
  title: "tbody tr td:nth-child(2) button > span:nth-child(2) > span:first-child",
  unavailable: "tbody tr td:nth-child(2) button > span:nth-child(3) > span:last-child",
};

type TrackRowState = {
  background: string;
  focused?: boolean;
  liked: boolean;
  unavailable?: boolean;
};

function trackRowParts(state: TrackRowState): PartSpec[] {
  const metadataColor = state.unavailable ? paper.neutral600 : paper.neutral400;

  return [
    {
      name: "row",
      paper: {
        backgroundColor: state.background,
        borderRadius: 6,
        height: 40,
        focusRing: state.focused ? insetFocusRing : undefined,
      },
      selector: rowSelectors.row,
    },
    {
      name: "artwork",
      paper: {
        borderRadius: 4,
        height: 32,
        left: 16,
        opacity: state.unavailable ? 0.4 : 1,
        width: 32,
      },
      selector: rowSelectors.artwork,
    },
    {
      name: "title",
      paper: {
        color: state.unavailable ? paper.neutral600 : paper.neutral100,
        fontFamily: "sans",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 16,
      },
      selector: rowSelectors.title,
    },
    {
      name: "artist",
      paper: { color: metadataColor, fontSize: 12, fontWeight: 400, lineHeight: 16 },
      selector: rowSelectors.artist,
    },
    {
      name: "album",
      paper: { color: metadataColor, fontSize: 13, fontWeight: 400, lineHeight: 16 },
      selector: rowSelectors.album,
    },
    {
      name: "duration",
      paper: {
        color: metadataColor,
        fontFamily: "mono",
        fontSize: 12,
        lineHeight: 16,
        width: 48,
      },
      selector: rowSelectors.duration,
    },
    ...(state.liked
      ? [
          {
            name: "heart",
            paper: { color: paper.neutral100, height: 16, width: 16 },
            selector: rowSelectors.heart,
          },
        ]
      : []),
    ...(state.unavailable
      ? [
          {
            name: "unavailable label",
            paper: { color: paper.neutral400, fontSize: 12, lineHeight: 16 },
            selector: rowSelectors.unavailable,
          },
        ]
      : []),
  ];
}

export function TrackRowSection() {
  return (
    <Section
      description="Frame 17. The app's TrackList, one row per state, with fixture playback."
      title="Track row"
    >
      <Specimen
        id="track-row.default"
        label="Default"
        parts={trackRowParts({ background: paper.transparent, liked: false })}
      >
        <TrackRowSpecimen track={componentStateTracks.default} />
      </Specimen>
      <Specimen
        force={{ selector: rowSelectors.row, states: ["hover"] }}
        id="track-row.hover"
        label="Hover"
        parts={trackRowParts({ background: paper.neutral850, liked: true })}
      >
        <TrackRowSpecimen track={componentStateTracks.hover} />
      </Specimen>
      <Specimen
        force={{ selector: rowSelectors.row, states: ["focus-within"] }}
        id="track-row.focus"
        label="Focus (keyboard)"
        parts={trackRowParts({ background: paper.transparent, focused: true, liked: true })}
      >
        <TrackRowSpecimen track={componentStateTracks.focus} />
      </Specimen>
      <Specimen
        id="track-row.selected"
        label="Selected"
        note="Not built: the app has no row selection yet (click plays)."
        parts={trackRowParts({ background: paper.neutral800, liked: true })}
      />
      <Specimen
        id="track-row.playing"
        label="Playing"
        parts={trackRowParts({ background: paper.accent10, liked: true })}
      >
        <TrackRowSpecimen playback="playing" track={componentStateTracks.playing} />
      </Specimen>
      <Specimen
        id="track-row.paused"
        label="Current, paused"
        parts={trackRowParts({ background: paper.accent10, liked: true })}
      >
        <TrackRowSpecimen playback="paused" track={componentStateTracks.playing} />
      </Specimen>
      <Specimen
        id="track-row.playing-selected"
        label="Playing + selected"
        note="Not built: the app has no row selection yet."
        parts={trackRowParts({ background: paper.neutral800, liked: true })}
      />
      <Specimen
        id="track-row.unavailable"
        label="Unavailable"
        parts={trackRowParts({ background: paper.transparent, liked: false, unavailable: true })}
      >
        <TrackRowSpecimen track={componentStateTracks.unavailable} />
      </Specimen>
    </Section>
  );
}

type ButtonState = "default" | "disabled" | "focus" | "hover";

const buttonStates: readonly ButtonState[] = ["default", "hover", "focus", "disabled"];

const forcedButtonStates = {
  default: undefined,
  disabled: undefined,
  focus: { selector: "button", states: ["focus-visible"] },
  hover: { selector: "button", states: ["hover"] },
} as const;

type ButtonPaper = {
  background: Record<ButtonState, string>;
  color: Record<ButtonState, string>;
};

type ButtonSize = "icon" | "small" | "text";

// Frame 17 for the 32px sizes; the 24px buttons from 09 ("Scan again", "Manage folders").
const buttonBoxes = {
  icon: { borderRadius: 6, height: 32, width: 32 },
  small: {
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    height: 24,
    lineHeight: 16,
    paddingLeft: 8,
    paddingRight: 8,
  },
  text: {
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    height: 32,
    lineHeight: 16,
    paddingLeft: 12,
    paddingRight: 12,
  },
} as const;

function buttonParts(state: ButtonState, values: ButtonPaper, size: ButtonSize): PartSpec[] {
  return [
    {
      name: "button",
      paper: {
        ...buttonBoxes[size],
        backgroundColor: values.background[state],
        color: values.color[state],
        focusRing: state === "focus" ? focusRing : undefined,
        opacity: state === "disabled" ? 0.4 : undefined,
      },
      selector: "button",
    },
    ...(size === "icon"
      ? [{ name: "icon", paper: { height: 16, width: 16 }, selector: "button svg" }]
      : []),
  ];
}

function sameInEveryState(value: string): Record<ButtonState, string> {
  return { default: value, disabled: value, focus: value, hover: value };
}

const buttonKinds: readonly {
  id: string;
  label: string;
  paper: ButtonPaper;
  render: (state: ButtonState) => ReactNode;
  size: ButtonSize;
}[] = [
  {
    id: "primary",
    label: "Primary",
    paper: {
      background: { ...sameInEveryState(paper.neutral100), hover: paper.neutral50 },
      color: sameInEveryState(paper.neutral950),
    },
    render: (state) => (
      <Button disabled={state === "disabled"} variant="primary">
        Add folder…
      </Button>
    ),
    size: "text",
  },
  {
    id: "secondary",
    label: "Secondary",
    paper: {
      background: { ...sameInEveryState(paper.neutral800), hover: paper.neutral750 },
      color: sameInEveryState(paper.neutral100),
    },
    render: (state) => <Button disabled={state === "disabled"}>Shuffle</Button>,
    size: "text",
  },
  {
    id: "ghost",
    label: "Ghost",
    paper: {
      background: { ...sameInEveryState(paper.transparent), hover: paper.neutral850 },
      color: {
        ...sameInEveryState(paper.neutral400),
        focus: paper.neutral100,
        hover: paper.neutral100,
      },
    },
    render: (state) => (
      <Button disabled={state === "disabled"} variant="ghost">
        Cancel
      </Button>
    ),
    size: "text",
  },
  {
    id: "danger",
    label: "Danger",
    paper: {
      background: { ...sameInEveryState(paper.red400), hover: paper.red350 },
      color: sameInEveryState(paper.neutral950),
    },
    render: (state) => (
      <Button disabled={state === "disabled"} variant="danger">
        Delete
      </Button>
    ),
    size: "text",
  },
  {
    id: "icon",
    label: "Icon (toolbar)",
    paper: {
      background: { ...sameInEveryState(paper.transparent), hover: paper.neutral850 },
      color: {
        ...sameInEveryState(paper.neutral400),
        focus: paper.neutral100,
        hover: paper.neutral100,
      },
    },
    render: (state) => (
      <Button
        aria-label="More options"
        disabled={state === "disabled"}
        size="icon"
        variant="toolbar"
      >
        <DotsThreeIcon aria-hidden="true" />
      </Button>
    ),
    size: "icon",
  },
  {
    id: "small-secondary",
    label: "Small secondary",
    paper: {
      background: { ...sameInEveryState(paper.neutral800), hover: paper.neutral750 },
      color: sameInEveryState(paper.neutral100),
    },
    render: (state) => (
      <Button disabled={state === "disabled"} size="sm">
        Scan again
      </Button>
    ),
    size: "small",
  },
  {
    id: "small-ghost",
    label: "Small ghost",
    paper: {
      background: { ...sameInEveryState(paper.transparent), hover: paper.neutral850 },
      color: {
        ...sameInEveryState(paper.neutral400),
        focus: paper.neutral100,
        hover: paper.neutral100,
      },
    },
    render: (state) => (
      <Button disabled={state === "disabled"} size="sm" variant="ghost">
        Manage folders
      </Button>
    ),
    size: "small",
  },
];

export function ButtonSection() {
  return (
    <Section
      description="Frame 17 (32px) and the 24px buttons in 09. The 24px hover, focus and disabled values follow the 32px rows; Paper only draws them at rest."
      title="Buttons"
    >
      {buttonKinds.flatMap((kind) =>
        buttonStates.map((state) => (
          <Specimen
            force={forcedButtonStates[state]}
            id={`button.${kind.id}.${state}`}
            key={`${kind.id}.${state}`}
            label={`${kind.label}, ${state}`}
            parts={buttonParts(state, kind.paper, kind.size)}
          >
            <div className="flex">{kind.render(state)}</div>
          </Specimen>
        )),
      )}
      <Specimen
        id="button.icon.toggled"
        label="Icon (toolbar), toggled"
        parts={[
          {
            name: "button",
            paper: {
              ...buttonBoxes.icon,
              backgroundColor: paper.neutral800,
              color: paper.neutral400,
            },
            selector: "button",
          },
        ]}
      >
        {/* The queue toggle in 12: neutral-800 fill. Frame 17's note adds the filled icon. */}
        <div className="flex">
          <Button aria-expanded aria-label="Close queue" size="icon" variant="toolbar">
            <SidebarSimpleIcon aria-hidden="true" className="-scale-x-100" weight="fill" />
          </Button>
        </div>
      </Specimen>
      <Specimen
        force={{ selector: "button", states: ["hover"] }}
        id="button.icon.toggled-hover"
        label="Icon (toolbar), toggled, hover"
        parts={[
          {
            name: "button",
            paper: {
              ...buttonBoxes.icon,
              backgroundColor: paper.neutral800,
              color: paper.neutral100,
            },
            selector: "button",
          },
        ]}
      >
        {/* Not drawn in Paper: the fill stays, so hovering never reads as switching it off. */}
        <div className="flex">
          <Button aria-expanded aria-label="Close queue" size="icon" variant="toolbar">
            <SidebarSimpleIcon aria-hidden="true" className="-scale-x-100" weight="fill" />
          </Button>
        </div>
      </Specimen>
      <Specimen
        id="button.shuffle.on"
        label="Shuffle, on"
        parts={[
          {
            name: "button",
            paper: { ...buttonBoxes.icon, backgroundColor: paper.neutral800, color: paper.amber },
            selector: "button",
          },
          {
            name: "dot",
            paper: { height: 4, width: 4, backgroundColor: paper.amber },
            selector: "button span",
          },
        ]}
      >
        {/* Frame 17's note: toggled fill, filled icon and the amber 4px dot. 12 draws it without the fill. */}
        <div className="flex">
          <Button
            aria-label="Shuffle"
            aria-pressed
            className="relative text-accent hover:not-data-disabled:text-accent focus-visible:text-accent"
            size="icon"
            variant="toolbar"
          >
            <ShuffleAngularIcon aria-hidden="true" weight="fill" />
            <span
              aria-hidden="true"
              className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
            />
          </Button>
        </div>
      </Specimen>
      <Specimen
        id="button.primary.busy"
        label="Primary, busy"
        parts={[
          {
            name: "button",
            // Paper's pending button in 07b: the label at 0.4, no spinner. Left padding follows the
            // spinner (icon side), so it is not compared. The spinner's box isn't either: a rotating
            // square measures larger than its 16px size.
            paper: {
              ...buttonBoxes.text,
              backgroundColor: paper.neutral100,
              color: paper.neutral950,
              opacity: 0.4,
              paddingLeft: undefined,
            },
            selector: "button",
          },
        ]}
      >
        <div className="flex">
          <Button busy variant="primary">
            Add folder…
          </Button>
        </div>
      </Specimen>
    </Section>
  );
}

type FieldState = "disabled" | "empty" | "focus" | "hover" | "invalid";

function fieldParts(state: FieldState): PartSpec[] {
  const edge = {
    disabled: paper.neutral800,
    empty: paper.neutral800,
    focus: paper.neutral700,
    hover: paper.neutral700,
    invalid: paper.red400,
  }[state];

  return [
    {
      name: "field",
      paper: {
        backgroundColor: paper.neutral950,
        borderRadius: 6,
        color: paper.neutral100,
        edge: `1px ${edge}`,
        fontSize: 13,
        height: 32,
        lineHeight: 16,
        paddingLeft: 10,
        paddingRight: 10,
        focusRing: state === "focus" ? focusRing : undefined,
        opacity: state === "disabled" ? 0.4 : undefined,
        // Only the empty fields show their placeholder.
        placeholderColor: state === "empty" || state === "hover" ? paper.neutral400 : undefined,
      },
      selector: "input",
    },
  ];
}

export function FieldSection() {
  return (
    <Section
      description="Frame 17. The app's Input, as the create-playlist dialog uses it."
      title="Text field"
    >
      <Specimen id="field.empty" label="Empty" parts={fieldParts("empty")}>
        <div className="w-74">
          <Input aria-label="Description" placeholder="What’s it for?" />
        </div>
      </Specimen>
      <Specimen
        force={{ selector: "input", states: ["hover"] }}
        id="field.hover"
        label="Hover"
        parts={fieldParts("hover")}
      >
        <div className="w-74">
          <Input aria-label="Description" placeholder="What’s it for?" />
        </div>
      </Specimen>
      <Specimen
        force={{ selector: "input", states: ["focus-visible"] }}
        id="field.focus"
        label="Focus"
        parts={fieldParts("focus")}
      >
        <div className="w-74">
          <Input aria-label="Title" defaultValue="Rainy Sunday" />
        </div>
      </Specimen>
      <Specimen id="field.invalid" label="Invalid" parts={fieldParts("invalid")}>
        <div className="w-74">
          <Input aria-invalid aria-label="Title" />
        </div>
      </Specimen>
      <Specimen id="field.disabled" label="Disabled" parts={fieldParts("disabled")}>
        <div className="w-74">
          <Input aria-label="Title" defaultValue="Rainy Sunday" disabled />
        </div>
      </Specimen>
      <Specimen
        id="field.filter"
        label="Filter"
        note="Not built: the app has no filter field yet."
        parts={[]}
      />
    </Section>
  );
}

type SwitchState = "disabled" | "focus" | "off" | "on";

function switchParts(state: SwitchState): PartSpec[] {
  const on = state !== "off";

  return [
    {
      name: "track",
      paper: {
        backgroundColor: on ? paper.neutral100 : paper.neutral700,
        borderRadius: 8,
        height: 16,
        width: 28,
        focusRing: state === "focus" ? focusRing : undefined,
        opacity: state === "disabled" ? 0.4 : undefined,
      },
      selector: "[data-slot=switch]",
    },
    {
      name: "thumb",
      paper: {
        backgroundColor: on ? paper.neutral950 : paper.neutral400,
        height: 12,
        width: 12,
      },
      selector: "[data-slot=switch-thumb]",
    },
  ];
}

export function SwitchSection() {
  return (
    <Section description="Frame 17. The app's Switch, as Settings uses it." title="Switch">
      <Specimen id="switch.on" label="On" parts={switchParts("on")}>
        <Switch aria-label="Enable folder" checked />
      </Specimen>
      <Specimen id="switch.off" label="Off" parts={switchParts("off")}>
        <Switch aria-label="Enable folder" checked={false} />
      </Specimen>
      <Specimen
        force={{ selector: "[data-slot=switch]", states: ["focus-visible"] }}
        id="switch.focus"
        label="Focus"
        parts={switchParts("focus")}
      >
        <Switch aria-label="Enable folder" checked />
      </Specimen>
      <Specimen id="switch.disabled" label="Disabled" parts={switchParts("disabled")}>
        <Switch aria-label="Enable folder" checked disabled />
      </Specimen>
    </Section>
  );
}

type NavState = "active" | "default" | "focus" | "hover";

function navParts(state: NavState): PartSpec[] {
  return [
    {
      name: "row",
      paper: {
        backgroundColor: {
          active: paper.neutral800,
          default: paper.transparent,
          focus: paper.transparent,
          hover: paper.neutral850,
        }[state],
        borderRadius: 6,
        color: state === "default" ? paper.neutral400 : paper.neutral100,
        fontSize: 13,
        fontWeight: state === "active" ? 500 : 400,
        height: 32,
        lineHeight: 16,
        paddingLeft: 8,
        paddingRight: 8,
        focusRing: state === "focus" ? insetFocusRing : undefined,
      },
      selector: "[data-sidebar=menu-button]",
    },
    {
      name: "count",
      paper: {
        backgroundColor: paper.transparent,
        color: paper.neutral400,
        fontFamily: "mono",
        fontSize: 12,
        fontWeight: 400,
        lineHeight: 16,
      },
      selector: "[data-sidebar=menu-badge]",
    },
  ];
}

/** A playlist row as AppSidebar renders it, without its menu. */
function NavRowSpecimen({
  count,
  isActive,
  title,
}: {
  count: number;
  isActive?: boolean;
  title: string;
}) {
  return (
    <SidebarProvider className="min-h-0 w-52">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="text-secondary" isActive={isActive}>
            <span>{title}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge className="font-mono rounded bg-selected px-1.5 py-1 text-[10px] text-tertiary tabular-nums">
            {count.toLocaleString()}
          </SidebarMenuBadge>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  );
}

export function NavRowSection() {
  return (
    <Section
      description="Frame 17. SidebarMenuButton and SidebarMenuBadge with AppSidebar's playlist-row classes."
      title="Sidebar row"
    >
      <Specimen id="nav.default" label="Default" parts={navParts("default")}>
        <NavRowSpecimen count={31} title="Default" />
      </Specimen>
      <Specimen
        force={{ selector: "[data-sidebar=menu-button]", states: ["hover"] }}
        id="nav.hover"
        label="Hover"
        parts={navParts("hover")}
      >
        <NavRowSpecimen count={22} title="Hover" />
      </Specimen>
      <Specimen id="nav.active" label="Active" parts={navParts("active")}>
        <NavRowSpecimen count={64} isActive title="Active" />
      </Specimen>
      <Specimen
        force={{ selector: "[data-sidebar=menu-button]", states: ["focus-visible"] }}
        id="nav.focus"
        label="Focus"
        parts={navParts("focus")}
      >
        <NavRowSpecimen count={19} title="Focus" />
      </Specimen>
      <Specimen
        id="nav.playing-from"
        label="Playing from"
        note="Not built: the sidebar has no playing-from dot yet."
        parts={[]}
      />
    </Section>
  );
}

export function RoughDataSection() {
  const items = roughDataTracks.map((track, index) => ({
    sourceEntryId: index + 1,
    track: toTrack(track, index + 1),
  }));

  return (
    <Section
      description="Frame 08c. Long titles, Japanese and Arabic, emoji, missing tags and artwork, hour-long durations, an unavailable file."
      title="Rough data"
    >
      <Specimen
        id="rough.list"
        label="Track list"
        parts={[
          {
            name: "column header",
            paper: {
              color: paper.neutral400,
              fontFamily: "mono",
              fontSize: 12,
              letterSpacing: 0.96,
              lineHeight: 16,
            },
            selector: "thead th:nth-child(2)",
          },
          { name: "header row", paper: { height: 32 }, selector: "thead tr" },
          ...items.flatMap((_item, index) => [
            {
              name: `row ${index + 1}`,
              paper: { height: 40 },
              selector: `tbody tr:nth-child(${index + 1})`,
            },
            {
              name: `row ${index + 1} title`,
              paper: { height: 16 },
              selector: `tbody tr:nth-child(${index + 1}) td:nth-child(2) button > span:nth-child(2) > span:first-child`,
            },
            {
              name: `row ${index + 1} time`,
              paper: { width: 56 },
              selector: `tbody tr:nth-child(${index + 1}) td:nth-child(4)`,
            },
          ]),
        ]}
      >
        <div className="w-[1216px]">
          <PlaybackContext.Provider value={idlePlayback}>
            <TrackList caption="Rough data" items={items} />
          </PlaybackContext.Provider>
        </div>
      </Specimen>
    </Section>
  );
}
