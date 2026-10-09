import {
  DotsThreeIcon,
  FunnelSimpleIcon,
  ShuffleAngularIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlaybackContext } from "@/hooks/use-playback";
import { TrackList } from "@/pages/tracks/track-list";
import {
  componentStateTracks,
  type FixtureTrack,
  roughDataTracks,
  toTrack,
} from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { focusRing, insetFocusRing, paper } from "@/states/paper-values";
import { idlePlayback } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

/** The app's track list with one row, under fixture playback state. */
function TrackRowSpecimen({
  playback = "idle",
  playlistId,
  selected = false,
  track,
}: {
  playback?: "idle" | "paused" | "playing";
  playlistId?: number;
  selected?: boolean;
  track: FixtureTrack;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const value =
    playback === "idle"
      ? idlePlayback
      : {
          ...idlePlayback,
          activeSourceEntryId: 1,
          activeSourcePlaylistId: playlistId ?? null,
          isPlaying: playback === "playing",
        };

  // Selection is the list's own state; a click is how it gets there.
  useEffect(() => {
    if (selected) ref.current?.querySelector<HTMLElement>("tbody tr")?.click();
  }, [selected]);

  return (
    <div className="-mx-2 w-[1200px]" ref={ref}>
      <PlaybackContext.Provider value={value}>
        <TrackList
          caption="Specimen"
          items={[{ sourceEntryId: 1, track: toTrack(track, 1) }]}
          playlistId={playlistId}
        />
      </PlaybackContext.Provider>
    </div>
  );
}

const rowSelectors = {
  added: "tbody tr td:nth-child(3)",
  album: "tbody tr td:nth-child(2) p",
  artist: "tbody tr [data-slot=track-artwork] + div > p:nth-child(2)",
  artwork: "tbody tr [data-slot=track-artwork]",
  artworkState: "tbody tr [data-slot=artwork-state]",
  cell: "tbody tr > td:first-child",
  duration: "tbody tr td:last-child",
  heart: "tbody tr td:nth-child(4) svg",
  row: "tbody tr",
  title: "tbody tr [data-slot=track-artwork] + div > p:first-child",
  unavailable: "tbody tr [data-slot=track-artwork] + div + span",
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
        borderRadius: 6,
        height: 40,
        focusRing: state.focused ? insetFocusRing : undefined,
      },
      selector: rowSelectors.row,
    },
    {
      name: "row fill",
      paper: { backgroundColor: state.background, borderRadius: 6, paddingLeft: 16 },
      selector: rowSelectors.cell,
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
        left: 56,
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
      paper: { color: metadataColor, fontSize: 13, fontWeight: 400, lineHeight: 16, width: 384 },
      selector: rowSelectors.album,
    },
    {
      name: "added",
      paper: { color: metadataColor, fontFamily: "sans", fontSize: 12, lineHeight: 16 },
      selector: rowSelectors.added,
    },
    {
      name: "time",
      paper: {
        color: metadataColor,
        fontFamily: "mono",
        fontSize: 12,
        lineHeight: 16,
        paddingRight: 16,
        // The 56px time slot (08c's rule, now on frame 17 too), its 16px gap and the row's padding
        width: 88,
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

function artworkStateParts(state: "paused" | "playing" | "selected"): PartSpec[] {
  return [
    {
      name: "scrim",
      paper: { backgroundColor: paper.scrim, height: 32, width: 32 },
      selector: rowSelectors.artworkState,
    },
    state === "selected"
      ? {
          name: "check",
          paper: { color: paper.neutral100, height: 14, width: 14 },
          selector: `${rowSelectors.artworkState} svg`,
        }
      : {
          name: "meter",
          paper: { height: 14, width: 14 },
          selector: `${rowSelectors.artworkState} > span`,
        },
    ...(state === "selected"
      ? []
      : [
          {
            name: "unlit dot",
            paper: { backgroundColor: paper.white20, borderRadius: 0.5, height: 2, width: 2 },
            selector: `${rowSelectors.artworkState} > span > span:first-child`,
          },
          {
            name: "bottom dot",
            paper: { backgroundColor: paper.amber, height: 2, width: 2 },
            selector: `${rowSelectors.artworkState} > span > span:last-child > span`,
          },
          {
            name: "upper dots",
            paper: { opacity: state === "playing" ? 1 : 0 },
            selector: `${rowSelectors.artworkState} > span > span:nth-last-child(2)`,
          },
        ]),
  ];
}

export function TrackRowSection() {
  return (
    <Section
      description="Frame 17 and 17b. The app's TrackList, one row per state, with fixture playback."
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
        parts={[
          ...trackRowParts({ background: paper.neutral850, liked: true }),
          {
            name: "more",
            paper: { color: paper.neutral400, height: 24, opacity: 1, width: 24 },
            selector: "tbody tr td:first-child button",
          },
        ]}
      >
        <TrackRowSpecimen track={componentStateTracks.hover} />
      </Specimen>
      <Specimen
        force={{ selector: rowSelectors.row, states: ["focus-visible"] }}
        id="track-row.focus"
        label="Focus (keyboard)"
        parts={trackRowParts({ background: paper.transparent, focused: true, liked: true })}
      >
        <TrackRowSpecimen track={componentStateTracks.focus} />
      </Specimen>
      <Specimen
        id="track-row.selected"
        label="Selected"
        parts={[
          ...trackRowParts({ background: paper.neutral800, liked: true }),
          ...artworkStateParts("selected"),
        ]}
      >
        <TrackRowSpecimen selected track={componentStateTracks.selected} />
      </Specimen>
      <Specimen
        id="track-row.playing"
        label="Playing"
        parts={[
          ...trackRowParts({ background: paper.accent10, liked: true }),
          ...artworkStateParts("playing"),
        ]}
      >
        <TrackRowSpecimen playback="playing" track={componentStateTracks.playing} />
      </Specimen>
      <Specimen
        id="track-row.paused"
        label="Current, paused"
        parts={[
          ...trackRowParts({ background: paper.accent10, liked: true }),
          ...artworkStateParts("paused"),
        ]}
      >
        <TrackRowSpecimen playback="paused" track={componentStateTracks.playing} />
      </Specimen>
      <Specimen
        id="track-row.playing-selected"
        label="Playing + selected"
        parts={[
          ...trackRowParts({ background: paper.neutral800, liked: true }),
          ...artworkStateParts("playing"),
        ]}
      >
        <TrackRowSpecimen playback="playing" selected track={componentStateTracks.playing} />
      </Specimen>
      <Specimen
        id="track-row.unavailable"
        label="Unavailable"
        parts={trackRowParts({ background: paper.transparent, liked: false, unavailable: true })}
      >
        <TrackRowSpecimen track={componentStateTracks.unavailable} />
      </Specimen>
      <Specimen
        id="track-row.missing-artwork"
        label="No artwork"
        parts={[
          {
            name: "tile",
            paper: { backgroundColor: paper.neutral900, borderRadius: 4, height: 32, width: 32 },
            selector: rowSelectors.artwork,
          },
          {
            name: "note icon",
            paper: { color: paper.neutral600, height: 14, width: 14 },
            selector: `${rowSelectors.artwork} > svg`,
          },
        ]}
      >
        <TrackRowSpecimen track={roughDataTracks[2]} />
      </Specimen>
      <Specimen
        id="track-row.playlist"
        label="Playlist, playing"
        parts={[
          {
            name: "number",
            paper: {
              color: paper.neutral500,
              fontFamily: "mono",
              fontSize: 12,
              lineHeight: 16,
              paddingLeft: 16,
              width: 40,
            },
            selector: rowSelectors.cell,
          },
          { name: "artwork", paper: { left: 56 }, selector: rowSelectors.artwork },
          {
            name: "row fill",
            paper: { backgroundColor: paper.accent10 },
            selector: rowSelectors.cell,
          },
        ]}
      >
        <TrackRowSpecimen playback="playing" playlistId={1} track={componentStateTracks.playing} />
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

type FieldState = "disabled" | "empty" | "focus" | "hover" | "invalid" | "invalid-focus";

function fieldParts(state: FieldState): PartSpec[] {
  const edge = {
    disabled: paper.neutral800,
    empty: paper.neutral800,
    focus: paper.neutral700,
    hover: paper.neutral700,
    invalid: paper.red400,
    "invalid-focus": paper.red400,
  }[state];

  return [
    {
      name: "field",
      paper: {
        backgroundColor: paper.neutral950,
        borderRadius: 6,
        color: state === "disabled" ? paper.neutral400 : paper.neutral100,
        edge: `1px ${edge}`,
        fontSize: 13,
        height: 32,
        lineHeight: 16,
        paddingLeft: 10,
        paddingRight: 10,
        focusRing: state === "focus" || state === "invalid-focus" ? focusRing : undefined,
        opacity: state === "disabled" ? 0.4 : undefined,
        // Only the empty fields show their placeholder.
        placeholderColor: state === "empty" || state === "hover" ? paper.neutral400 : undefined,
      },
      selector: "input",
    },
  ];
}

// Frame 15, "B · No title": label, invalid field and its error, then the description field.
const formFieldParts: PartSpec[] = [
  {
    name: "label",
    paper: { color: paper.neutral400, fontSize: 12, fontWeight: 500, lineHeight: 16 },
    selector: "label[for=states-title]",
  },
  {
    name: "error",
    paper: { color: paper.red300, fontSize: 12, fontWeight: 400, lineHeight: 16 },
    selector: "#states-title-error",
  },
  {
    name: "optional",
    paper: { color: paper.neutral400, fontSize: 12, fontWeight: 400, lineHeight: 16 },
    selector: "label[for=states-description] span",
  },
  {
    name: "textarea",
    paper: {
      backgroundColor: paper.neutral950,
      borderRadius: 6,
      edge: `1px ${paper.neutral800}`,
      fontSize: 13,
      height: 72,
      lineHeight: 20,
      paddingLeft: 10,
      paddingRight: 10,
      placeholderColor: paper.neutral400,
    },
    selector: "textarea",
  },
];

type FilterState = "default" | "focus" | "hover";

function filterParts(state: FilterState): PartSpec[] {
  return [
    {
      name: "field",
      paper: {
        backgroundColor: paper.neutral900,
        borderRadius: 6,
        edge: `1px ${state === "default" ? paper.neutral800 : paper.neutral700}`,
        height: 32,
        width: 296,
        focusRing: state === "focus" ? focusRing : "none",
      },
      selector: "[data-slot=input-group]",
    },
    {
      name: "icon",
      // 10px from the field's left edge
      paper: { color: paper.neutral500, height: 14, left: 10, width: 14 },
      selector: "svg",
    },
    {
      name: "input",
      paper: {
        color: paper.neutral100,
        fontSize: 13,
        lineHeight: 16,
        placeholderColor: state === "focus" ? undefined : paper.neutral400,
      },
      selector: "input",
    },
    {
      name: "hint",
      paper: {
        borderRadius: 4,
        color: paper.neutral400,
        edge: `1px ${paper.neutral700}`,
        fontFamily: "mono",
        fontSize: 12,
        height: 16,
        // 4px from the field's right edge: 296 − 4 − 16
        left: 276,
        lineHeight: 16,
        width: 16,
      },
      selector: "kbd",
    },
  ];
}

// How the Library screens will compose the filter: shadcn's InputGroup on the page's raised fill.
function FilterField(props: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup className="bg-raised">
      <InputGroupInput aria-label="Filter tracks" {...props} />
      <InputGroupAddon>
        <FunnelSimpleIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Kbd aria-hidden="true">/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function FieldSection() {
  return (
    <Section
      description="Frame 17, and frame 15 for the label, error and description field."
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
      <Specimen
        force={{ selector: "input", states: ["focus-visible", "hover"] }}
        id="field.invalid-focus"
        label="Invalid, focus"
        parts={fieldParts("invalid-focus")}
      >
        <div className="w-74">
          <Input aria-invalid aria-label="Title" />
        </div>
      </Specimen>
      <Specimen id="field.disabled" label="Disabled" parts={fieldParts("disabled")}>
        <div className="w-74">
          <Input aria-label="Title" defaultValue="Rainy Sunday" disabled />
        </div>
      </Specimen>
      <Specimen id="field.form" label="Label and error" parts={formFieldParts}>
        <FieldGroup className="w-87.5">
          <Field>
            <Label htmlFor="states-title">Title</Label>
            <Input aria-describedby="states-title-error" aria-invalid id="states-title" />
            <p className="text-meta text-danger" id="states-title-error">
              Give the playlist a title.
            </p>
          </Field>
          <Field>
            <Label htmlFor="states-description">
              Description <span className="font-normal">Optional</span>
            </Label>
            <Textarea id="states-description" placeholder="What’s it for?" />
          </Field>
        </FieldGroup>
      </Specimen>
      <Specimen id="field.filter" label="Filter" parts={filterParts("default")}>
        <div className="w-74">
          <FilterField placeholder="Filter tracks" />
        </div>
      </Specimen>
      <Specimen
        force={{ selector: "[data-slot=input-group]", states: ["hover"] }}
        id="field.filter.hover"
        label="Filter, hover"
        parts={filterParts("hover")}
      >
        <div className="w-74">
          <FilterField placeholder="Filter tracks" />
        </div>
      </Specimen>
      <Specimen
        force={{ selector: "input", states: ["focus-visible"] }}
        id="field.filter.focus"
        label="Filter, focus"
        parts={filterParts("focus")}
      >
        <div className="w-74">
          <FilterField defaultValue="night" />
        </div>
      </Specimen>
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
        width: 24,
      },
      selector: "[data-sidebar=menu-button] > span:last-child",
    },
  ];
}

/** A playlist row as AppSidebar renders it, without its menu. */
function NavRowSpecimen({
  count,
  isActive,
  isPlayingFrom,
  title,
}: {
  count: number;
  isActive?: boolean;
  isPlayingFrom?: boolean;
  title: string;
}) {
  return (
    <SidebarProvider className="min-h-0 w-[207px]">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={isActive}>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {isPlayingFrom && (
              <span className="size-1.5 shrink-0 rounded-full bg-accent" data-part="dot" />
            )}
            <span className="min-w-6 shrink-0 text-right font-mono text-meta font-normal text-secondary tabular-nums">
              {count.toLocaleString()}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  );
}

export function NavRowSection() {
  return (
    <Section
      description="Frame 17. SidebarMenuButton with AppSidebar's playlist-row content."
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
        parts={[
          ...navParts("default"),
          {
            name: "dot",
            paper: { backgroundColor: paper.amber, borderRadius: 3, height: 6, width: 6 },
            selector: "[data-part=dot]",
          },
        ]}
      >
        <NavRowSpecimen count={48} isPlayingFrom title="Playing from" />
      </Specimen>
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
            selector: "thead th:first-child",
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
              selector: `tbody tr:nth-child(${index + 1}) [data-slot=track-artwork] + div > p:first-child`,
            },
            {
              name: `row ${index + 1} time`,
              paper: { width: 88 },
              selector: `tbody tr:nth-child(${index + 1}) td:last-child`,
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
