import { useLayoutEffect, useRef, useState } from "react";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createAudioTimeStore } from "@/hooks/use-media-element";
import { PlaybackContext, PlaybackTimeContext } from "@/hooks/use-playback";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";
import type { PartSpec } from "@/states/measure";
import { focusRing, paper } from "@/states/paper-values";
import { idlePlayback } from "@/states/playback-fixture";
import { Section, Specimen } from "@/states/specimen";

const playerStates = [
  "idle",
  "playing",
  "paused",
  "shuffle-queue",
  "muted",
  "last-in-queue",
  "rough",
  "ten-minutes",
  "no-artwork",
  "no-tags",
  "japanese",
  "arabic",
  "seek-hover",
  "seek-focus",
  "seek-dragging",
  "loading",
  "focus",
  "controls-hover",
  "controls-focus",
  "controls-active",
  "volume-hover",
  "volume-focus",
  "volume-dragging",
] as const;

type PlayerState = (typeof playerStates)[number];

const playingTrack = {
  ...toTrack(componentStateTracks.playing, 1),
  format: "FLAC",
  sampleRate: 44100,
  bitsPerSample: 16,
};

const longTrack = {
  ...playingTrack,
  artworkUrl: toTrack(roughDataTracks[1]!, 2).artworkUrl,
  duration: 4457,
  id: 2,
  title: "Symphony No. 9 in D minor, Op. 125 “Choral”: IV. Presto – Allegro assai",
  artists: ["Berliner Philharmoniker", "Herbert von Karajan", "Gundula Janowitz"],
  sampleRate: 192000,
  bitsPerSample: 24,
};

export function PlayerSection() {
  return (
    <Section
      title="Header player"
      description="Paper 19 states and 19b left-anchored readouts. Next/previous compare covers and duration bands."
    >
      {playerStates.map((state) => {
        const selector =
          state === "focus"
            ? "button[aria-label=Pause]"
            : state.startsWith("seek-")
              ? "[data-slot=player-seek] input"
              : state.startsWith("volume-")
                ? state === "volume-dragging"
                  ? "[data-slot=player-volume] div:has(> input)"
                  : "[data-slot=player-volume] input"
                : state.startsWith("controls-")
                  ? "button"
                  : null;

        return (
          <Specimen
            force={
              selector
                ? {
                    selector,
                    states: [
                      state === "focus" || state.endsWith("-focus")
                        ? "focus-visible"
                        : state.endsWith("-dragging")
                          ? "dragging"
                          : state.endsWith("-active")
                            ? "active"
                            : "hover",
                    ],
                  }
                : undefined
            }
            id={`player.${state}`}
            key={state}
            label={state}
            parts={playerParts(state)}
          >
            <PlayerSpecimen state={state} />
          </Specimen>
        );
      })}
    </Section>
  );
}

function PlayerSpecimen({ state }: { state: PlayerState }) {
  const root = useRef<HTMLDivElement>(null);
  const [alternate, setAlternate] = useState(state === "rough");

  const [timeStore] = useState(() => {
    const store = createAudioTimeStore();
    store.set(
      state === "rough"
        ? 3734
        : state === "seek-dragging"
          ? 328
          : state === "no-tags"
            ? 48
            : state === "loading"
              ? 0
              : 202,
    );

    return store;
  });

  const [paused, setPaused] = useState(state === "paused");
  const [queueOpen, setQueueOpen] = useState(state === "shuffle-queue");
  const [shuffle, setShuffle] = useState(state === "shuffle-queue");
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(state === "muted");

  const track =
    state === "idle"
      ? null
      : alternate
        ? longTrack
        : state === "no-artwork"
          ? { ...toTrack(roughDataTracks[2]!, 3), duration: 473, format: "MP3", sampleRate: 44100 }
          : state === "no-tags"
            ? {
                ...toTrack(roughDataTracks[3]!, 4),
                title: "track07_final_v2",
                duration: 113,
                format: "WAV",
                sampleRate: 48000,
                bitsPerSample: 24,
              }
            : state === "japanese"
              ? { ...toTrack(roughDataTracks[4]!, 5), sampleRate: 44100, bitsPerSample: 16 }
              : state === "arabic"
                ? { ...toTrack(roughDataTracks[5]!, 6), sampleRate: 44100, bitsPerSample: 16 }
                : state === "ten-minutes"
                  ? { ...playingTrack, duration: 604 }
                  : playingTrack;

  useLayoutEffect(() => {
    if (state !== "seek-hover") return;

    const control = root.current?.querySelector("[data-slot=player-seek] > div");

    if (control) {
      const bounds = control.getBoundingClientRect();
      control.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: bounds.left + bounds.width * 0.7,
        }),
      );
    }
  }, [state]);

  const changeTrack = () => {
    timeStore.set(alternate ? 202 : 3734);
    setAlternate(!alternate);
  };

  return (
    <SidebarProvider
      className={`min-h-0 w-[1216px] ${state === "controls-active" ? "[&_button]:transition-none" : ""}`}
      ref={root}
    >
      <PlaybackContext.Provider
        value={{
          ...idlePlayback,
          activeQueueItemId: track ? String(track.id) : null,
          activeTrack: track,
          canGoNext: track !== null && state !== "last-in-queue",
          duration: state === "loading" ? 0 : (track?.duration ?? 0),
          isMuted: muted,
          isPlaying: track !== null && !paused,
          next: changeTrack,
          previous: changeTrack,
          queue: track
            ? {
                current: null,
                manualQueue: [],
                sourceQueue: [],
                source: { kind: "all-tracks" },
                status: paused ? "paused" : "playing",
              }
            : null,
          setShuffleEnabled: setShuffle,
          setVolume,
          seek: timeStore.set,
          shuffleEnabled: track !== null && shuffle,
          toggleMute: () => setMuted(!muted),
          togglePlayback: () => setPaused(!paused),
          volume,
        }}
      >
        <PlaybackTimeContext.Provider value={timeStore}>
          <AudioPlayerControls queueOpen={queueOpen} toggleQueue={() => setQueueOpen(!queueOpen)} />
        </PlaybackTimeContext.Provider>
      </PlaybackContext.Provider>
    </SidebarProvider>
  );
}

function playerParts(state: PlayerState): PartSpec[] {
  const idle = state === "idle";

  return [
    {
      name: "toolbar",
      selector: "[data-slot=player]",
      paper: { height: 48, width: 1216, paddingLeft: 16, paddingRight: 16 },
    },
    {
      name: "transport",
      selector: "[data-slot=player-transport]",
      paper: { height: 32, width: 200 },
    },
    {
      name: "display",
      selector: "[data-slot=player-display]",
      paper: {
        width: 520,
        height: 40,
        borderRadius: 8,
        backgroundColor: paper.neutral900,
        edge: `1px ${paper.neutral800}`,
        paddingLeft: 4,
        paddingRight: 12,
      },
    },
    {
      name: "artwork",
      selector: idle ? "[data-slot=player-idle-artwork]" : "[data-slot=track-artwork]",
      paper: { width: 32, height: 32, borderRadius: 4 },
    },
    {
      name: "title",
      selector: "[data-slot=player-title]",
      paper: {
        fontFamily: "sans",
        fontSize: 12,
        lineHeight: 16,
        fontWeight: idle ? 400 : 500,
        color: idle ? paper.neutral400 : paper.neutral100,
        width: state === "rough" ? 272.8 : undefined,
      },
    },
    ...(idle
      ? []
      : [
          {
            name: "artist",
            selector: "[data-slot=player-artist]",
            paper: {
              fontFamily: "sans" as const,
              fontSize: 12,
              lineHeight: 16,
              color: paper.neutral400,
              width: state === "rough" ? 96 : undefined,
            },
          },
          {
            name: "format",
            selector: "[data-slot=player-format]",
            paper: {
              fontFamily: "mono" as const,
              fontSize: 12,
              lineHeight: 16,
              color: paper.neutral400,
            },
          },
          {
            name: "waveform",
            selector: "[data-slot=player-seek] svg",
            paper: { width: 340, height: 12 },
          },
        ]),
    {
      name: "elapsed",
      selector: "[data-slot=player-elapsed]",
      paper: {
        fontFamily: "mono",
        fontSize: 12,
        lineHeight: 16,
        width: state === "rough" ? 50.4 : state === "ten-minutes" || idle ? 36 : 28.8,
        color: idle
          ? paper.neutral600
          : state === "seek-dragging"
            ? paper.neutral100
            : paper.neutral400,
      },
    },
    {
      name: "remaining",
      selector: "[data-slot=player-remaining]",
      paper: {
        fontFamily: "mono",
        fontSize: 12,
        lineHeight: 16,
        width: state === "rough" ? 43.2 : 36,
        color: idle ? paper.neutral600 : paper.neutral400,
      },
    },
    {
      name: "play button",
      selector: "[data-slot=player-transport] > button:nth-child(3)",
      paper: {
        width: state === "controls-active" ? 30.72 : 32,
        height: state === "controls-active" ? 30.72 : 32,
        borderRadius: state === "controls-active" ? 15.36 : 16,
        backgroundColor: state === "controls-hover" ? paper.neutral50 : paper.neutral100,
        color: paper.neutral950,
        opacity: idle ? 0.4 : 1,
        focusRing: state === "focus" || state === "controls-focus" ? focusRing : undefined,
      },
    },
    {
      name: "play icon",
      selector: "[data-slot=player-transport] > button:nth-child(3) svg",
      paper: {
        width: state === "controls-active" ? 15.36 : 16,
        height: state === "controls-active" ? 15.36 : 16,
      },
    },
    {
      name: "utilities",
      selector: "[data-slot=player-utilities]",
      paper: { width: 200, height: 32 },
    },
    { name: "volume", selector: "[data-slot=player-volume]", paper: { width: 48, height: 32 } },
    {
      name: "volume thumb",
      selector: "[data-slot=player-volume] div:has(> input)",
      paper: { width: 8, height: 8, opacity: state.startsWith("volume-") ? 1 : 0 },
    },
    ...(!idle
      ? [
          {
            name: "seek hit area",
            selector: "[data-slot=player-seek] > div",
            paper: { width: 340, height: 24, opacity: state === "loading" ? 0.4 : 1 },
          },
          {
            name: "seek drawing",
            selector: "[data-slot=player-seek] > div > div:first-child",
            paper: {
              width: 340,
              height: 12,
              focusRing: state === "seek-focus" ? focusRing : undefined,
            },
          },
        ]
      : []),
  ];
}
