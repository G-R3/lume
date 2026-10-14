import { MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LikeButton } from "@/components/like-button";
import { Button } from "@/components/ui/button";
import { Group, Range, Segmented, Toggle } from "@/motion-lab/controls";
import { likeDuration, type LikeFeel } from "@/lib/motion";
import { type FeelName, feelNames, heartFeels } from "@/motion-lab/heart-feels";

type HeartConfig = {
  feel: FeelName;
  grid: boolean;
  reducedMotion: "user" | "always" | "never";
  scrub: boolean;
  speed: number;
  time: number;
  zoom: number;
};

const defaults: HeartConfig = {
  feel: "heartbeat",
  grid: true,
  reducedMotion: "user",
  scrub: false,
  speed: 1,
  time: 120,
  zoom: 8,
};

const storageKey = "lume-motion-lab-heart";

function loadConfig(): HeartConfig {
  try {
    const stored = { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };

    return stored.feel in heartFeels ? stored : { ...stored, feel: defaults.feel };
  } catch {
    return defaults;
  }
}

/**
 * The like animation (src/components/like-button.tsx), the real component at actual size and
 * zoomed. Speed and scrubbing act on the browser animations Motion creates.
 */
export function HeartLab({ viewSwitch }: { viewSwitch: ReactNode }) {
  const [config, setConfig] = useState(loadConfig);
  const update = (patch: Partial<HeartConfig>) => setConfig((value) => ({ ...value, ...patch }));
  const stageRef = useRef<HTMLDivElement>(null);
  const live = useRef(config);
  live.current = config;
  const { feel } = heartFeels[config.feel];
  const totalMs = Math.round(likeDuration(feel) * 1000);

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(config)), [config]);

  // Animations start a frame or two after the click, so each new one is caught as it appears:
  // slowed to the chosen speed, or paused at the scrub time.
  const follow = () => {
    const until =
      performance.now() +
      400 +
      (likeDuration(heartFeels[live.current.feel].feel) * 1000) / live.current.speed;

    const tick = () => {
      for (const animation of stageAnimations(stageRef.current)) {
        const { scrub, speed, time } = live.current;

        if (scrub) {
          if (animation.playState !== "paused") {
            animation.pause();
            animation.currentTime = clampTime(animation, time);
          }
        } else if (animation.playbackRate !== speed) {
          animation.playbackRate = speed;
        }
      }

      if (performance.now() < until) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  useEffect(() => {
    for (const animation of stageAnimations(stageRef.current)) {
      if (config.scrub) {
        animation.pause();
        animation.currentTime = clampTime(animation, config.time);
      } else if (animation.playState === "paused") {
        animation.playbackRate = config.speed;
        animation.play();
      }
    }
  }, [config.scrub, config.time, config.speed]);

  const replay = () => {
    const hearts = stageRef.current?.querySelectorAll<HTMLButtonElement>("[aria-pressed]") ?? [];

    // `detail` 0 is a keyboard press (instant unlike); 1 is a pointer click (celebrates)
    for (const heart of hearts) {
      if (heart.getAttribute("aria-pressed") === "true")
        heart.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    }

    requestAnimationFrame(() => {
      for (const heart of hearts)
        heart.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      follow();
    });
  };

  const scaled = 24 * config.zoom;

  return (
    <div className="flex h-screen bg-page text-primary">
      <main
        className="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-10"
        onClickCapture={follow}
        ref={stageRef}
      >
        <MotionConfig reducedMotion={config.reducedMotion}>
          <section className="flex flex-col gap-3">
            <h2 className="text-meta text-secondary">Actual size, in a track row</h2>
            <div className="flex h-10 w-120 items-center gap-2 rounded-md bg-page-hover pr-4 pl-4">
              <span className="size-8 shrink-0 rounded-sm bg-raised" />
              <span className="min-w-0 flex-1 truncate text-body font-medium">Night swim</span>
              <LabHeart feel={feel} />
              <span className="w-14 text-right font-mono text-meta text-secondary tabular-nums">
                4:12
              </span>
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-meta text-secondary">
              {config.zoom}× · dashed: the 24px button and the 16px heart
              {config.grid && " · grid: 1px"}
            </h2>
            <div
              className="relative"
              style={{
                backgroundImage: config.grid
                  ? "linear-gradient(to right, oklch(1 0 0 / 10%) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 10%) 1px, transparent 1px)"
                  : undefined,
                backgroundSize: `${config.zoom}px ${config.zoom}px`,
                height: scaled,
                width: scaled,
              }}
            >
              <div style={{ zoom: config.zoom }}>
                <LabHeart feel={feel} />
              </div>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 border border-dashed border-strong"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute border border-dashed border-strong"
                style={{
                  height: 16 * config.zoom,
                  left: 4 * config.zoom,
                  top: 4 * config.zoom,
                  width: 16 * config.zoom,
                }}
              />
            </div>
          </section>
        </MotionConfig>
      </main>
      <aside
        className="flex w-84 shrink-0 flex-col gap-6 overflow-y-auto border-l border-separator bg-page px-5 py-5"
        data-lab-panel
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-semibold">Motion lab</h1>
          <p className="text-meta text-secondary">
            Like: the outline breathes in as the filled heart grows out of it, rings and a faint
            pulse leave it, and pairs of dots drift out. Pick a feel, then click either heart, or
            Replay to run both. Tab to a heart and press Enter for the keyboard path (instant).
          </p>
        </div>
        {viewSwitch}
        <Group title="Feel" note={heartFeels[config.feel].note}>
          <div className="grid grid-cols-1 gap-1">
            {feelNames.map((name) => (
              <Button
                aria-pressed={config.feel === name}
                key={name}
                onClick={() => update({ feel: name })}
                size="sm"
                type="button"
                variant="toolbar"
              >
                {heartFeels[name].label}
              </Button>
            ))}
          </div>
        </Group>
        <Group title="Playback" note={`This feel takes ${totalMs}ms at 1×.`}>
          <Button onClick={replay} size="sm" type="button">
            Replay
          </Button>
          <Segmented
            onChange={(speed: string) => update({ speed: Number(speed) })}
            options={[
              ["1", "1×"],
              ["0.5", "0.5×"],
              ["0.25", "0.25×"],
              ["0.1", "0.1×"],
            ]}
            value={String(config.speed)}
          />
          <Toggle
            checked={config.scrub}
            label="Scrub"
            note="Replay freezes at the time below; drag it to step through. Off resumes."
            onChange={(scrub) => update({ scrub })}
          />
          <Range
            format={(value) => `${value}ms`}
            label="Time"
            max={totalMs}
            min={0}
            onChange={(time) => update({ time })}
            step={5}
            value={config.time}
          />
        </Group>
        <Group title="View">
          <Segmented
            onChange={(zoom: string) => update({ zoom: Number(zoom) })}
            options={[
              ["4", "4×"],
              ["8", "8×"],
              ["12", "12×"],
            ]}
            value={String(config.zoom)}
          />
          <Toggle checked={config.grid} label="Pixel grid" onChange={(grid) => update({ grid })} />
        </Group>
        <Group title="Reduced motion" note="Follow the system, or force it either way.">
          <Segmented
            onChange={(reducedMotion: HeartConfig["reducedMotion"]) => update({ reducedMotion })}
            options={[
              ["user", "System"],
              ["always", "Always"],
              ["never", "Never"],
            ]}
            value={config.reducedMotion}
          />
        </Group>
        <Button onClick={() => setConfig(defaults)} size="sm" type="button">
          Reset
        </Button>
      </aside>
    </div>
  );
}

function LabHeart({ feel }: { feel: LikeFeel }) {
  const [liked, setLiked] = useState(false);

  return (
    <LikeButton
      feel={feel}
      label={liked ? "Unlike Night swim" : "Like Night swim"}
      liked={liked}
      onToggle={() => setLiked((value) => !value)}
    />
  );
}

function stageAnimations(stage: HTMLElement | null) {
  return stage?.getAnimations({ subtree: true }) ?? [];
}

// One millisecond short of the end, so a scrubbed animation never finishes (finishing unmounts the dots)
function clampTime(animation: Animation, time: number) {
  const end = Number(animation.effect?.getComputedTiming().endTime ?? time);

  return Math.min(time, end - 1);
}
