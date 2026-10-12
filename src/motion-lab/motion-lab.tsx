import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../shared/lib";
import type { ReactNode } from "react";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format-duration";
import {
  everythingOff,
  feels,
  LabConfigContext,
  phase10,
  recommended,
  type FeelName,
  type LabConfig,
} from "@/motion-lab/config";
import { mixTracks, useInputModality, useLabPlayback, type Input } from "@/motion-lab/playback";
import { useSampleTracks } from "@/motion-lab/samples";
import { LabPlayer } from "@/motion-lab/player";
import { LabSound } from "@/motion-lab/sound";
import { Group, Range, Segmented, Toggle } from "@/motion-lab/controls";
import { ScanLab } from "@/motion-lab/scan/scan-lab";
import { ScrollFadeLab } from "@/motion-lab/scroll-fade-lab";

const storageKey = "lume-motion-lab";

const feelNames: (keyof typeof feels)[] = ["today", "tape", "glass", "smooth"];

function loadConfig(): LabConfig {
  try {
    return { ...recommended, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {
    return recommended;
  }
}

const viewKey = "lume-motion-lab-view";

type View = "fade" | "player" | "scan";

export function MotionLab() {
  const [view, setView] = useState<View>(() => {
    const stored = localStorage.getItem(viewKey);

    return stored === "scan" || stored === "fade" ? stored : "player";
  });

  useEffect(() => localStorage.setItem(viewKey, view), [view]);

  const viewSwitch = (
    <Segmented
      onChange={setView}
      options={[
        ["player", "Header player"],
        ["scan", "First scan"],
        ["fade", "Scroll fade"],
      ]}
      value={view}
    />
  );

  if (view === "fade") return <ScrollFadeLab viewSwitch={viewSwitch} />;

  return view === "player" ? (
    <PlayerLab viewSwitch={viewSwitch} />
  ) : (
    <ScanLab viewSwitch={viewSwitch} />
  );
}

function PlayerLab({ viewSwitch }: { viewSwitch: ReactNode }) {
  const [config, setConfig] = useState(loadConfig);
  const [sound] = useState(() => new LabSound());
  const samples = useSampleTracks();
  const tracks = useMemo(() => mixTracks(samples), [samples]);
  const playback = useLabPlayback(sound, tracks);
  const live = useRef(playback);
  live.current = playback;
  const modality = useInputModality();
  const artworkRef = useRef<HTMLDivElement>(null);
  const update = (patch: Partial<LabConfig>) => setConfig((current) => ({ ...current, ...patch }));

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(config)), [config]);

  useEffect(() => {
    sound.ramps = config.ramps;
    sound.speed = config.speed;
  }, [sound, config.ramps, config.speed]);

  useEffect(() => {
    if (!config.sound) return;

    sound.setTrack(live.current.track?.url || null);
    void sound.enable(config.soundSource).then(() => {
      if (!live.current.playing) return;

      sound.play();
      sound.seek(live.current.time.get());
    });

    return () => sound.disable();
  }, [sound, config.sound, config.soundSource]);

  // Stage shortcuts. Keyboard actions take the instant path, as the brief says.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;

      if (target.closest("[data-lab-panel], [role=slider], input, button")) return;

      if (event.key === " ") playback.toggle("keyboard");
      else if (event.key === "ArrowRight") playback.next("keyboard");
      else if (event.key === "ArrowLeft") playback.previous("keyboard");
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  const play = (index: number, input: Input, from?: HTMLElement | null) => {
    const to = artworkRef.current;
    const track = tracks[index]!;

    if (config.flight && !config.reduced && input === "pointer" && from && to && track.artworkUrl)
      fly(from, to, track.artworkUrl, config.speed);

    playback.playIndex(index, input);
  };

  return (
    <LabConfigContext value={config}>
      <div className="flex h-screen bg-page text-primary">
        <main className="flex min-w-0 flex-1 flex-col">
          <LabPlayer artworkRef={artworkRef} modality={modality} playback={playback} />
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!playback.track}
                onClick={() => playback.seek(Math.max(0, (playback.track?.duration ?? 0) - 3))}
                size="sm"
                type="button"
              >
                3 seconds before the end
              </Button>
              <Button
                disabled={!playback.track}
                onClick={() => {
                  for (const delay of [0, 70, 140, 210])
                    window.setTimeout(() => playback.next("pointer"), delay);
                }}
                size="sm"
                type="button"
              >
                Mash Next ×4
              </Button>
              <Button
                disabled={!playback.track}
                onClick={() => playback.stop()}
                size="sm"
                type="button"
              >
                Stop (queue end)
              </Button>
              <p className="ml-2 text-meta text-tertiary">
                Space, ← and → act as the keyboard (instant). Click and double-click act as the
                pointer.
              </p>
            </div>
            <TrackList
              current={playback.index}
              onPlay={play}
              playing={playback.playing}
              tracks={tracks}
            />
          </div>
        </main>
        <ControlPanel config={config} update={update} viewSwitch={viewSwitch} />
      </div>
    </LabConfigContext>
  );
}

/** 23C: a copy of the row's artwork flies to the display's slot. */
function fly(from: HTMLElement, to: HTMLElement, url: string, speed: number) {
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const duration = 350 / speed;

  const outer = document.createElement("div");
  const image = document.createElement("img");
  outer.style.cssText = `position:fixed;left:${start.left}px;top:${start.top}px;width:${start.width}px;height:${start.height}px;z-index:50;pointer-events:none`;
  image.src = url;
  image.style.cssText =
    "width:100%;height:100%;border-radius:4px;outline:1px solid oklch(1 0 0 / 10%);outline-offset:-1px";
  outer.append(image);
  document.body.append(outer);
  to.style.opacity = "0";

  // X and Y on separate elements with different curves draw an arc instead of a straight line
  outer.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${end.left - start.left}px)` }],
    {
      duration,
      easing: "cubic-bezier(0.45, 0, 0.2, 1)",
      fill: "forwards",
    },
  );

  const rise = image.animate(
    [
      { transform: "translateY(0) scale(1)" },
      { transform: `translateY(${end.top - start.top}px) scale(${end.width / start.width})` },
    ],
    { duration, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" },
  );

  void rise.finished.then(() => {
    to.style.opacity = "";
    outer.remove();
  });
}

function TrackList({
  tracks,
  current,
  playing,
  onPlay,
}: {
  current: number | null;
  playing: boolean;
  onPlay: (index: number, input: Input, artwork: HTMLElement | null) => void;
  tracks: Track[];
}) {
  return (
    <div className="flex flex-col">
      <p className="px-4 pb-2 text-meta text-tertiary">
        Double-click a row to play from the pointer, or focus one and press Enter.
      </p>
      {tracks.map((track, index) => (
        <div
          className="flex h-10 cursor-default items-center gap-3 rounded-md px-4 outline-none select-none hover:bg-page-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          key={track.id}
          onDoubleClick={(event) =>
            onPlay(index, "pointer", event.currentTarget.querySelector("[data-slot=track-artwork]"))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") onPlay(index, "keyboard", null);
          }}
          tabIndex={0}
        >
          <TrackArtwork
            artworkUrl={track.artworkUrl}
            className="size-8"
            state={current === index ? (playing ? "playing" : "paused") : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body font-medium">{track.title}</span>
            <span className="truncate text-meta text-secondary">{track.artists.join(", ")}</span>
          </div>
          <span className="font-mono text-meta text-secondary tabular-nums">
            {formatDuration(track.duration)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ControlPanel({
  config,
  update,
  viewSwitch,
}: {
  config: LabConfig;
  update: (patch: Partial<LabConfig>) => void;
  viewSwitch: ReactNode;
}) {
  const feel = config.feel === "custom" ? config.custom : feels[config.feel];

  return (
    <aside
      className="flex w-84 shrink-0 flex-col gap-6 overflow-y-auto border-l border-separator bg-page px-5 py-5"
      data-lab-panel
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Motion lab</h1>
        <p className="text-meta text-secondary">
          Development only. Paper boards 20–23, live. Settings persist in this browser.
        </p>
      </div>

      {viewSwitch}

      <div className="flex gap-1.5">
        <Button onClick={() => update(recommended)} size="sm" type="button" variant="primary">
          Recommended
        </Button>
        <Button onClick={() => update(phase10)} size="sm" type="button">
          Phase 10 today
        </Button>
        <Button onClick={() => update(everythingOff)} size="sm" type="button">
          All instant
        </Button>
      </div>

      <Group
        title="Feel"
        note="One spring for enters and a shorter one for exits. Everything below uses it."
      >
        <Segmented
          onChange={(name: FeelName) =>
            update(
              name === "custom"
                ? { feel: name, custom: { enter: { ...feel.enter }, exit: { ...feel.exit } } }
                : { feel: name },
            )
          }
          options={[
            ...feelNames.map((key) => [key, feels[key].label] as const),
            ["custom", "Custom"] as const,
          ]}
          value={config.feel}
        />
        <p className="text-meta text-tertiary">
          {config.feel === "custom" ? "Your values." : feels[config.feel].note}
        </p>
        {config.feel === "custom" && (
          <>
            <Range
              format={(value) => `${Math.round(value * 1000)}ms`}
              label="Enter duration"
              max={0.6}
              min={0.1}
              onChange={(value) =>
                update({
                  custom: {
                    ...config.custom,
                    enter: { ...config.custom.enter, visualDuration: value },
                  },
                })
              }
              step={0.01}
              value={feel.enter.visualDuration}
            />
            <Range
              format={(value) => value.toFixed(2)}
              label="Enter bounce"
              max={0.4}
              min={0}
              onChange={(value) =>
                update({
                  custom: { ...config.custom, enter: { ...config.custom.enter, bounce: value } },
                })
              }
              step={0.01}
              value={feel.enter.bounce}
            />
            <Range
              format={(value) => `${Math.round(value * 1000)}ms`}
              label="Exit duration"
              max={0.4}
              min={0.05}
              onChange={(value) =>
                update({
                  custom: {
                    ...config.custom,
                    exit: { ...config.custom.exit, visualDuration: value },
                  },
                })
              }
              step={0.01}
              value={feel.exit.visualDuration}
            />
          </>
        )}
        <Segmented
          onChange={(speed: string) => update({ speed: Number(speed) })}
          options={[
            ["1", "100%"],
            ["0.5", "50%"],
            ["0.25", "25%"],
            ["0.1", "10%"],
          ]}
          value={String(config.speed)}
        />
        <Toggle
          checked={config.reduced}
          label="Reduced motion"
          note="Movement removed, opacity kept. Also follows the system setting in real use."
          onChange={(reduced) => update({ reduced })}
        />
      </Group>

      <Group
        title="20 · Track change"
        note="Next, Previous, auto-advance and picking from the list."
      >
        <Segmented
          onChange={(trackChange: LabConfig["trackChange"]) => update({ trackChange })}
          options={[
            ["instant", "Instant"],
            ["crossfade", "Crossfade"],
            ["roll", "Roll"],
            ["slide", "Slide"],
          ]}
          value={config.trackChange}
        />
        <Range
          format={(value) => `${value}px`}
          label="Travel"
          max={16}
          min={0}
          onChange={(distance) => update({ distance })}
          step={1}
          value={config.distance}
        />
        <Range
          format={(value) => `${value}ms`}
          label="Stagger"
          max={80}
          min={0}
          onChange={(stagger) => update({ stagger })}
          step={5}
          value={config.stagger}
        />
        <Range
          format={(value) => `${value}px`}
          label="Blur"
          max={4}
          min={0}
          onChange={(blur) => update({ blur })}
          step={0.5}
          value={config.blur}
        />
        <Toggle
          checked={config.drain}
          label="Amber drain"
          note="The old fill fades instead of snapping to grey."
          onChange={(drain) => update({ drain })}
        />
        <Toggle
          checked={config.bandGlide}
          label="Band glide"
          note="The waveform glides when the readout width changes (10 min and 1 h tracks)."
          onChange={(bandGlide) => update({ bandGlide })}
        />
      </Group>

      <Group title="21 · Seek">
        <Toggle
          checked={config.grab}
          label="Grab opens the rows"
          note="3px to 4px pitch while held."
          onChange={(grab) => update({ grab })}
        />
        <Toggle
          checked={config.rubber}
          label="Rubber band"
          note="Drag past either end."
          onChange={(rubber) => update({ rubber })}
        />
        <Toggle
          checked={config.glide}
          label="Click glide"
          note="The fill glides to a clicked point."
          onChange={(glide) => update({ glide })}
        />
        <Toggle
          checked={config.smoothFill}
          label="Smooth fill"
          note="Every frame, instead of 4 times a second."
          onChange={(smoothFill) => update({ smoothFill })}
        />
      </Group>

      <Group title="22 · Power-on">
        <Toggle
          checked={config.powerOn}
          label="Power on and down"
          note="First play from idle, and Stop."
          onChange={(powerOn) => update({ powerOn })}
        />
        <Range
          format={(value) => `${value}ms`}
          label="Column stagger"
          max={6}
          min={0}
          onChange={(powerStagger) => update({ powerStagger })}
          step={0.5}
          value={config.powerStagger}
        />
      </Group>

      <Group
        title="23 · Trials and details"
        note="A, the play ↔ pause line morph, was cut (October 10)."
      >
        <Toggle
          checked={config.counter}
          label="B · Tape-counter readouts"
          note="Same-shape values roll only the characters that change; a new shape rolls whole."
          onChange={(counter) => update({ counter })}
        />
        <Toggle
          checked={config.flight}
          label="C · Row → display flight"
          note="Double-click a row."
          onChange={(flight) => update({ flight })}
        />
      </Group>

      <Group
        title="23D · Sound"
        note="Turn sound on, play, then pause and seek with ramps on and off. The tone makes the click obvious; Track file plays the sample behind the current track (fixtures fall back to the loop)."
      >
        <Toggle
          checked={config.sound}
          label="Sound"
          onChange={(value) => update({ sound: value })}
        />
        <Segmented
          onChange={(soundSource: LabConfig["soundSource"]) => update({ soundSource })}
          options={[
            ["tone", "Tone"],
            ["loop", "Loop"],
            ["track", "Track file"],
          ]}
          value={config.soundSource}
        />
        <Toggle
          checked={config.ramps}
          label="Gain ramps"
          note="Pause 120ms, play 60ms, seek 15ms, skip 80ms."
          onChange={(ramps) => update({ ramps })}
        />
      </Group>
    </aside>
  );
}
