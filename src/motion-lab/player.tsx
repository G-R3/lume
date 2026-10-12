// The header player from src/components/audio-player-controls.tsx, class for class, with the
// motion concepts from Paper boards 20–23 switchable through the lab's config.

import { Slider } from "@base-ui/react/slider";
import {
  PauseIcon,
  PlayIcon,
  QueueIcon,
  ShuffleAngularIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import {
  animate,
  AnimatePresence,
  motion,
  spring as springGenerator,
  useIsPresent,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { ReactNode, Ref, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Track } from "../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import { feels, useLab } from "@/motion-lab/config";
import type { Change, Input, LabPlayback } from "@/motion-lab/playback";

const levels = [
  1, 1, 2, 2, 3, 3, 2, 3, 2, 3, 2, 2, 2, 2, 1, 2, 2, 3, 2, 2, 3, 2, 3, 3, 2, 2, 2, 2, 1, 2, 2, 2, 2,
  1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 3, 2, 3, 1, 2, 2, 1, 1, 1, 2, 2, 2, 3, 2, 3, 3, 3, 3,
  4, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 2, 3, 2, 2, 2, 2, 1,
];

// Each dot's resting y in the 12px drawing on a 3px row pitch, and how far it moves when the rows
// open to a 4px pitch. Open rows reach 1px past the drawing, inside the focus ring's 2px offset.
const dots = levels.flatMap((level, column) =>
  Array.from({ length: level }, (_, row) => {
    const y = Math.floor((12 - (level * 3 - 1)) / 2) + row * 3;

    return {
      column,
      x: column * 4 + 1,
      y,
      open: Math.floor((12 - (level * 4 - 2)) / 2) + row * 4 - y,
    };
  }),
);

const groups = [-1, 0, 1, 2].map((delta) => ({
  delta,
  dots: dots.filter((dot) => dot.open === delta),
}));

const width = 340;

const centre = 5;

export function LabPlayer({
  playback,
  modality,
  artworkRef,
}: {
  playback: LabPlayback;
  modality: RefObject<Input>;
  artworkRef: RefObject<HTMLDivElement | null>;
}) {
  const { track } = playback;
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  return (
    <header
      aria-label="Player"
      className="@container/player flex h-12 w-full shrink-0 items-center gap-4 border-b border-separator bg-page px-4 pt-px"
    >
      <div className="flex shrink-0 items-center gap-1 @min-[984px]/player:w-50">
        <Button aria-label="Shuffle" size="icon" type="button" variant="toolbar">
          <ShuffleAngularIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label="Previous track"
          className="text-primary"
          disabled={!track}
          onClick={() => playback.previous(modality.current)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SkipBackIcon aria-hidden="true" weight="fill" />
        </Button>
        <Button
          aria-label={playback.playing ? "Pause" : "Play"}
          className="rounded-full"
          onClick={() => playback.toggle(modality.current)}
          size="icon"
          type="button"
          variant="primary"
        >
          {playback.playing ? (
            <PauseIcon aria-hidden="true" weight="fill" />
          ) : (
            <PlayIcon aria-hidden="true" weight="fill" />
          )}
        </Button>
        <Button
          aria-label="Next track"
          className="text-primary"
          disabled={!track}
          onClick={() => playback.next(modality.current)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SkipForwardIcon aria-hidden="true" weight="fill" />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="@container/display relative flex h-10 w-130 max-w-full min-w-0 items-center gap-2 rounded-lg bg-raised py-1 pr-3 pl-1 ring-1 ring-default ring-inset">
          <div className="absolute inset-x-0 top-1 grid px-3 pl-1">
            <Metadata artworkRef={artworkRef} change={playback.change} track={track} />
          </div>
          <span aria-hidden="true" className="size-8 shrink-0" />
          <div className="min-w-0 flex-1 pt-4">
            <Progress modality={modality} playback={playback} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 pr-2 @min-[984px]/player:w-50">
        <Button
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          aria-pressed={muted}
          onClick={() => setMuted(!muted)}
          size="icon"
          type="button"
          variant="toolbar"
        >
          {muted ? <SpeakerSlashIcon aria-hidden="true" /> : <SpeakerHighIcon aria-hidden="true" />}
        </Button>
        <Slider.Root
          aria-label="Volume"
          className="mr-2 hidden w-12 @min-[700px]/player:block"
          max={1}
          min={0}
          onValueChange={(value) => {
            setVolume(value);
            setMuted(false);
          }}
          step={0.01}
          thumbAlignment="edge"
          value={muted ? 0 : volume}
        >
          <Slider.Control className="group/volume relative flex h-8 cursor-pointer touch-none items-center rounded-xs has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
            <Slider.Track className="relative h-0.5 w-full overflow-hidden rounded-xs bg-track">
              <Slider.Indicator className="h-full bg-inverse" />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Volume"
              className="absolute size-2 rounded-full bg-inverse opacity-0 group-hover/volume:opacity-100 group-has-focus-visible/volume:opacity-100 data-dragging:opacity-100 [&_input]:outline-none"
            />
          </Slider.Control>
        </Slider.Root>
        <Button aria-label="Open queue sidebar" size="icon" type="button" variant="toolbar">
          <QueueIcon aria-hidden="true" />
        </Button>
        <span aria-hidden="true" className="hidden w-13 @min-[984px]/player:block" />
      </div>
    </header>
  );
}

function Metadata({
  track,
  change,
  artworkRef,
}: {
  track: Track | null;
  change: Change;
  artworkRef: RefObject<HTMLDivElement | null>;
}) {
  const { config } = useLab();
  const artist = track?.artists.join(", ") || "Unknown artist";

  const format = track
    ? [
        track.format.toUpperCase(),
        track.sampleRate
          ? `${track.sampleRate / 1000}${track.bitsPerSample ? `/${track.bitsPerSample}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="size-8 shrink-0" ref={artworkRef}>
        <Field
          change={change}
          className="size-8 overflow-hidden rounded-sm"
          order={0}
          value={track ? (track.artworkUrl ?? "missing") : "idle"}
        >
          {track ? (
            <TrackArtwork artworkUrl={track.artworkUrl} className="size-8 bg-selected" />
          ) : (
            <span className="block size-8 rounded-sm bg-selected" />
          )}
        </Field>
      </div>
      <div className="flex h-4 min-w-0 flex-1 items-center gap-2 text-meta">
        <Field
          change={change}
          className="min-w-0"
          order={1}
          value={track?.title ?? "Double-click a track to play"}
        >
          <bdi
            className={cn("block truncate", track ? "font-medium text-primary" : "text-secondary")}
            title={track?.title}
          >
            {track?.title ?? "Double-click a track to play"}
          </bdi>
        </Field>
        {track && (
          <>
            <Field change={change} className="min-w-24 flex-1" order={2} value={artist}>
              <bdi className="block truncate text-left text-secondary" title={artist}>
                {artist}
              </bdi>
            </Field>
            <div className="hidden shrink-0 @min-[900px]/player:block">
              {config.counter ? (
                <Counter change={change} className="text-secondary" order={3} value={format} />
              ) : (
                <Field change={change} order={3} value={format}>
                  <span className="block font-mono text-secondary">{format}</span>
                </Field>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 20: one field of the display rolling through the window. */
function Field({
  value,
  change,
  order,
  instant: forceInstant = false,
  className,
  children,
}: {
  value: string;
  change: Change;
  order: number;
  instant?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { config } = useLab();

  const mode =
    config.reduced && config.trackChange !== "instant" ? "crossfade" : config.trackChange;

  const instant = forceInstant || mode === "instant" || change.input === "keyboard";
  const offset = config.distance * (change.direction === 0 ? 0 : change.direction);
  const custom = { instant, mode, offset, delay: (order * config.stagger) / 1000 };

  return (
    <div
      className={cn(
        "relative isolate",
        order === 0 ? "overflow-clip" : "overflow-x-visible overflow-y-clip",
        className,
      )}
    >
      <AnimatePresence custom={custom} initial={false} mode="popLayout">
        <FieldLayer custom={custom} key={value}>
          {children}
        </FieldLayer>
      </AnimatePresence>
    </div>
  );
}

type FieldCustom = { instant: boolean; mode: string; offset: number; delay: number };

function FieldLayer({
  custom,
  children,
  ref,
}: {
  custom: FieldCustom;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const { config, spring, tween } = useLab();
  const present = useIsPresent();
  const axis = custom.mode === "slide" ? "x" : "y";
  const blur = `blur(${config.blur}px)`;
  const travel = (offset: number) => (axis === "x" ? { x: offset } : { y: offset });

  const variants = {
    enter: (p: FieldCustom) =>
      p.instant
        ? { opacity: 1 }
        : p.mode === "crossfade"
          ? { opacity: 0 }
          : { opacity: 0, ...travel(p.offset), filter: blur },
    center: (p: FieldCustom) => ({
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      transition: p.instant
        ? { duration: 0 }
        : p.mode === "crossfade"
          ? tween(0.15, [0.2, 0, 0, 1])
          : spring("enter", p.delay),
    }),
    exit: (p: FieldCustom) =>
      p.instant
        ? { opacity: 0, transition: { duration: 0 } }
        : p.mode === "crossfade"
          ? { opacity: 1, transition: tween(0.15, "linear") }
          : {
              opacity: 0,
              ...travel(-p.offset),
              filter: blur,
              transition: spring("exit", p.delay),
            },
  };

  return (
    <motion.div
      animate="center"
      aria-hidden={!present || undefined}
      className={cn(custom.mode === "crossfade" && present && "relative z-10 bg-raised")}
      custom={custom}
      exit="exit"
      initial="enter"
      ref={ref}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

/**
 * 23B: readouts change like a tape counter. When the old and new values have the same shape, only
 * the characters that differ roll; when the shape changes (FLAC 44.1/16 → MP3 44.1, 7:53 → 10:04)
 * the whole readout rolls like any other field. Ticks during playback swap in place.
 */
function Counter({
  value,
  change,
  order,
  className,
}: {
  value: string;
  change: Change;
  order: number;
  className?: string;
}) {
  const { config, spring } = useLab();
  const seen = useRef(change.id);

  const rolling =
    config.counter && !config.reduced && change.input !== "keyboard" && seen.current !== change.id;

  const direction = change.direction === -1 ? -1 : 1;

  useEffect(() => {
    seen.current = change.id;
  });

  const variants = {
    enter: (p: CounterCustom) =>
      p.rolling ? { y: `${100 * p.direction}%`, opacity: 0 } : { y: "0%", opacity: 1 },
    center: (p: CounterCustom) => ({
      y: "0%",
      opacity: 1,
      transition: p.rolling ? spring("enter", p.delay) : { duration: 0 },
    }),
    exit: (p: CounterCustom) =>
      p.rolling
        ? { y: `${-100 * p.direction}%`, opacity: 0, transition: spring("exit", p.delay) }
        : { opacity: 0, transition: { duration: 0 } },
  };

  return (
    <span className={cn("block shrink-0 font-mono text-meta tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      <Field
        change={change}
        className="block"
        instant={!rolling}
        order={order}
        value={String(value.length)}
      >
        <span aria-hidden="true" className="flex">
          {value.split("").map((character, index) => {
            const custom = {
              rolling,
              direction,
              delay: (order * config.stagger + index * 20) / 1000,
            };

            return (
              <span className="relative inline-block h-4 w-[1ch] overflow-clip" key={index}>
                <AnimatePresence custom={custom} initial={false}>
                  <motion.span
                    animate="center"
                    className="absolute inset-0 text-center"
                    custom={custom}
                    exit="exit"
                    initial="enter"
                    key={character}
                    variants={variants}
                  >
                    {character === " " ? " " : character}
                  </motion.span>
                </AnimatePresence>
              </span>
            );
          })}
        </span>
      </Field>
    </span>
  );
}

type CounterCustom = { rolling: boolean; direction: number; delay: number };

function Progress({ playback, modality }: { playback: LabPlayback; modality: RefObject<Input> }) {
  const { config, spring, tween } = useLab();
  const { track, time, change } = playback;
  const duration = track?.duration ?? 0;
  const progress = useMotionValue(0);
  const hover = useMotionValue<number | null>(null);
  const open = useMotionValue(0);
  const stretch = useMotionValue(0);
  const ghost = useMotionValue(0);
  const ghostOpacity = useMotionValue(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const gliding = useRef(false);
  const lastChange = useRef(change.id);
  const pointer = useRef<{ x: number; dragging: boolean } | null>(null);

  useMotionValueEvent(time, "change", (value) => {
    setSeconds(Math.floor(value));

    if (gliding.current || pointer.current?.dragging || duration === 0) return;

    // Phase 10 redraws on timeupdate, about 4 times a second; the smooth fill follows every frame
    const shown = config.smoothFill ? value : Math.floor(value * 4) / 4;

    progress.set((shown / duration) * width);
  });

  // Track change: the old amber fill drains instead of snapping to grey
  useLayoutEffect(() => {
    if (lastChange.current === change.id) return;

    lastChange.current = change.id;
    ghost.set(change.from * width);
    progress.set(0);

    const instant =
      !config.drain || change.input === "keyboard" || config.trackChange === "instant";

    ghostOpacity.set(instant ? 0 : 1);

    if (!instant) animate(ghostOpacity, 0, tween(0.2, [0.23, 1, 0.32, 1]));
  });

  const shown = preview ?? seconds;

  const elapsed = !track
    ? "--:--"
    : duration >= 3600 && shown < 3600
      ? `0:${formatDuration(shown).padStart(5, "0")}`.padStart(formatDuration(duration).length, "0")
      : formatDuration(shown).padStart(formatDuration(duration).length, "0");

  const remaining =
    track && duration > 0 ? `−${formatDuration(Math.max(0, duration - shown))}` : "--:--";

  const measure = (event: { clientX: number }, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const raw = event.clientX - bounds.left;
    const overshoot = raw < 0 ? raw : raw > bounds.width ? raw - bounds.width : 0;

    return { fraction: Math.max(0, Math.min(1, raw / bounds.width)), overshoot };
  };

  const release = () => {
    animate(open, 0, spring("exit"));
    animate(stretch, 0, {
      type: "spring",
      visualDuration: 0.3 / config.speed,
      bounce: config.reduced ? 0 : 0.15,
    });
  };

  return (
    <div className="group/progress flex h-4 min-w-0 items-center gap-2">
      <Counter
        change={change}
        className={cn(
          !track ? "text-disabled" : preview !== null ? "text-primary" : "text-secondary",
        )}
        order={1}
        value={elapsed}
      />
      <motion.div
        aria-label="Playback position in seconds"
        aria-valuemax={duration}
        aria-valuemin={0}
        aria-valuenow={Math.floor(seconds)}
        className="group/seek relative -my-1 flex h-6 w-85 min-w-0 shrink cursor-pointer touch-none items-center outline-none @min-[504px]/display:shrink-0"
        layout={config.bandGlide && !config.reduced ? "position" : false}
        onKeyDown={(event) => {
          if (!track) return;

          const step = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[event.key];

          if (step === undefined) return;

          event.preventDefault();
          event.stopPropagation();
          hover.set(null);
          playback.seek(Math.max(0, Math.min(duration - 1, time.get() + step)));
        }}
        onPointerDown={(event) => {
          if (!track) return;

          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { x: event.clientX, dragging: false };
        }}
        onPointerLeave={() => {
          if (!pointer.current) hover.set(null);
        }}
        onPointerMove={(event) => {
          if (!track) return;

          const { fraction, overshoot } = measure(event, event.currentTarget);

          if (!pointer.current) {
            if (!gliding.current) hover.set(fraction * width);

            return;
          }

          if (!pointer.current.dragging && Math.abs(event.clientX - pointer.current.x) > 3) {
            // 21: the rows open only once this is a drag, never on a click
            pointer.current.dragging = true;
            hover.set(null);

            if (config.grab && !config.reduced) animate(open, 1, spring("enter"));
          }

          if (!pointer.current.dragging) return;

          setPreview(Math.floor(fraction * duration));
          progress.set(fraction * width);

          if (config.rubber && !config.reduced)
            stretch.set(Math.sign(overshoot) * Math.min(4, Math.sqrt(Math.abs(overshoot)) * 0.8));
        }}
        onPointerUp={(event) => {
          if (!pointer.current || !track) return;

          const { fraction } = measure(event, event.currentTarget);
          const dragged = pointer.current.dragging;
          pointer.current = null;
          setPreview(null);
          release();

          if (!dragged && config.glide && !config.reduced && modality.current !== "keyboard") {
            // The hover fill stays put while the played edge glides into it, so nothing flickers
            gliding.current = true;
            void animate(progress, fraction * width, spring("exit")).then(() => {
              gliding.current = false;
              hover.set(null);
            });
          } else {
            progress.set(fraction * width);
            hover.set(null);
          }

          playback.seek(Math.min(fraction * duration, duration - 0.5));
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setPreview(null);
          release();
        }}
        role="slider"
        tabIndex={track ? 0 : -1}
      >
        <div className="relative h-3 w-full rounded-xs group-focus-visible/seek:outline-2 group-focus-visible/seek:outline-offset-2 group-focus-visible/seek:outline-focus">
          <Waveform
            ghost={ghost}
            ghostOpacity={ghostOpacity}
            hover={hover}
            open={open}
            powered={track !== null}
            poweredBy={change.input}
            progress={progress}
            stretch={stretch}
          />
        </div>
      </motion.div>
      <Counter
        change={change}
        className={track ? "text-secondary" : "text-disabled"}
        order={2}
        value={remaining}
      />
    </div>
  );
}

function Waveform({
  progress,
  hover,
  ghost,
  ghostOpacity,
  open,
  stretch,
  powered,
  poweredBy,
}: {
  progress: MotionValue<number>;
  hover: MotionValue<number | null>;
  ghost: MotionValue<number>;
  ghostOpacity: MotionValue<number>;
  open: MotionValue<number>;
  stretch: MotionValue<number>;
  powered: boolean;
  poweredBy: Input;
}) {
  const { config } = useLab();
  const root = useRef<HTMLDivElement>(null);

  // Clips reach past the 12px drawing vertically so the open rows are never cut off
  const playedClip = useMotionTemplate`inset(-4px ${useTransform(() => width - progress.get())}px -4px 0px)`;
  const ghostClip = useMotionTemplate`inset(-4px ${useTransform(() => width - ghost.get())}px -4px 0px)`;

  const hoverClip = useTransform(() => {
    const at = hover.get();

    if (at === null) return "inset(-4px 340px -4px 0px)";

    const start = Math.min(at, progress.get());
    const end = Math.max(at, progress.get());

    return `inset(-4px ${width - end}px -4px ${start}px)`;
  });

  // 21: past either end the waveform stretches toward the pointer from the opposite edge, which
  // stays pinned, instead of the whole drawing sliding over
  const scaleX = useTransform(stretch, (value) => 1 + Math.abs(value) / width);
  const originX = useTransform(stretch, (value) => (value < 0 ? 1 : 0));

  // 22: idle is the waveform with every column collapsed onto the centre line. Powering on springs
  // each column open, left to right; powering down folds them back, right to left.
  const powerState = useRef(powered ? 1 : 0);

  useEffect(() => {
    const element = root.current;

    if (!element) return;

    const rects = [...element.querySelectorAll<SVGRectElement>("rect[data-y]")];

    const write = (factor: (column: number) => number) => {
      for (const rect of rects) {
        const y = Number(rect.dataset.y);

        rect.setAttribute(
          "transform",
          `translate(0 ${(centre - y) * (1 - factor(Number(rect.dataset.column)))})`,
        );
      }
    };

    const target = powered ? 1 : 0;
    const animated = config.powerOn && !config.reduced && poweredBy !== "keyboard";

    if (!animated || powerState.current === target) {
      powerState.current = target;
      write(() => target);

      return;
    }

    powerState.current = target;

    const feel = config.feel === "custom" ? config.custom : feels[config.feel];

    const curve = springGenerator({
      keyframes: [0, 1],
      visualDuration: (powered ? feel.enter : feel.exit).visualDuration,
      bounce: 0,
    });

    const stagger = powered ? config.powerStagger : config.powerStagger / 2;
    const total = (curve.calculatedDuration ?? 0.4) * 1000 + levels.length * stagger + 100;

    const controls = animate(0, total, {
      duration: total / 1000 / config.speed,
      ease: "linear",
      onUpdate: (now) =>
        write((column) => {
          const start = (powered ? column : levels.length - 1 - column) * stagger;
          const value = curve.next(Math.max(0, now - start)).value;

          return powered ? value : 1 - value;
        }),
      onComplete: () => write(() => target),
    });

    return () => controls.stop();
  }, [powered, poweredBy, config]);

  const layer = (fill: string) => (
    <svg
      aria-hidden="true"
      className="absolute top-0 left-0 overflow-visible"
      height="12"
      width="340"
    >
      {groups.map(({ delta, dots: groupDots }) => (
        <OpenGroup delta={delta} key={delta} open={open}>
          {groupDots.map((dot) => (
            <rect
              className={fill}
              data-column={dot.column}
              data-y={dot.y}
              height="2"
              key={`${dot.x}-${dot.y}`}
              rx="0.5"
              width="2"
              x={dot.x}
              y={dot.y}
            />
          ))}
        </OpenGroup>
      ))}
    </svg>
  );

  return (
    <motion.div className="absolute inset-0" ref={root} style={{ scaleX, originX }}>
      {layer("fill-track")}
      <motion.div
        className="absolute inset-0"
        style={{ clipPath: ghostClip, opacity: ghostOpacity }}
      >
        {layer("fill-accent")}
      </motion.div>
      <motion.div className="absolute inset-0" style={{ clipPath: hoverClip }}>
        {layer("fill-accent/60")}
      </motion.div>
      <motion.div className="absolute inset-0" style={{ clipPath: playedClip }}>
        {layer("fill-accent")}
      </motion.div>
    </motion.div>
  );
}

function OpenGroup({
  delta,
  open,
  children,
}: {
  delta: number;
  open: MotionValue<number>;
  children: ReactNode;
}) {
  const y = useTransform(open, (value) => delta * value);

  return <motion.g style={{ y }}>{children}</motion.g>;
}
