import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { spring } from "motion";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createAudioTimeStore } from "@/hooks/use-media-element";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext, PlaybackTimeContext } from "@/hooks/use-playback";
import { markFirstScan } from "@/motion-lab/scan/first-scan-flag";
import { AppSidebar } from "@/pages/layout/sidebar";
import { LibraryOnboarding } from "@/motion-lab/scan/library-empty-state";
import { TracksPage } from "@/motion-lab/scan/tracks";
import { fixtureLibrary } from "@/motion-lab/scan/fixture-library";
import { idlePlayback } from "@/states/playback-fixture";
import { Group, Range, Segmented, Toggle } from "@/motion-lab/controls";
import { cn } from "@/lib/utils";

export type ScanConfig = {
  variant: "current" | "tune-in";
  speed: number;
  reduced: boolean;
  scanSeconds: number;
  trackCount: number;
  tuning: boolean;
  tuningStyle: "shimmer" | "wave";
  fold: boolean;
  sweep: boolean;
  flash: boolean;
  rowStep: number;
  rise: number;
  blur: number;
  countUp: boolean;
  tally: boolean;
  titleFlight: boolean;
  sound: boolean;
  shell: "instant" | "fade" | "assemble";
};

const tuneIn: ScanConfig = {
  variant: "tune-in",
  speed: 1,
  reduced: false,
  scanSeconds: 1.6,
  trackCount: 137,
  tuning: true,
  tuningStyle: "shimmer",
  fold: false,
  sweep: false,
  flash: false,
  rowStep: 40,
  rise: 4,
  blur: 1.5,
  countUp: true,
  tally: false,
  titleFlight: false,
  sound: false,
  shell: "assemble",
};

const current: ScanConfig = { ...tuneIn, variant: "current" };

const storageKey = "lume-motion-lab-scan-2";

function loadConfig(): ScanConfig {
  try {
    return { ...tuneIn, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {
    return tuneIn;
  }
}

type Phase = "idle" | "scanning" | "revealing" | "done";

type StageState = {
  config: ScanConfig;
  phase: Phase;
  run: number;
  setPhase: (phase: Phase) => void;
};

const StageContext = createContext<StageState | null>(null);

export function ScanLab({ viewSwitch }: { viewSwitch: ReactNode }) {
  const [config, setConfig] = useState(loadConfig);
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const update = (patch: Partial<ScanConfig>) => setConfig((value) => ({ ...value, ...patch }));

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(config)), [config]);

  const [queryClient] = useState(() => new QueryClient());

  const [router] = useState(() =>
    createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: createRootRoute({ component: Stage }),
    }),
  );

  const replay = (skipToReveal: boolean) => {
    setRun((value) => value + 1);

    if (!skipToReveal) setPhase("idle");
    else if (config.variant === "current") {
      markFirstScan();
      setPhase("done");
    } else setPhase("revealing");
  };

  return (
    <StageContext value={{ config, phase, run, setPhase }}>
      <div className="flex h-screen bg-page text-primary">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
        <aside
          className="flex w-84 shrink-0 flex-col gap-6 overflow-y-auto border-l border-separator bg-page px-5 py-5"
          data-lab-panel
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-title font-semibold">Motion lab</h1>
            <p className="text-meta text-secondary">
              First scan: from the empty window to a library. The stage renders the real sidebar and
              player with lab copies of the onboarding block, the Tracks page and the list.
            </p>
          </div>
          {viewSwitch}
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => replay(false)} size="sm" type="button" variant="primary">
              Replay from empty
            </Button>
            <Button onClick={() => replay(true)} size="sm" type="button">
              Replay the reveal
            </Button>
          </div>

          <Group
            title="Variant"
            note="Before is Phase 12's first cut. Tune in, as reset, is what ships (src/lib/first-scan.ts); its toggles are below."
          >
            <Segmented
              onChange={(variant: ScanConfig["variant"]) =>
                update(variant === "current" ? { variant } : { ...tuneIn, ...config, variant })
              }
              options={[
                ["current", "Before"],
                ["tune-in", "Tune in"],
              ]}
              value={config.variant}
            />
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
              note="Tune in keeps the fades and drops every movement and the stagger."
              onChange={(reduced) => update({ reduced })}
            />
            <Range
              format={(value) => `${value.toFixed(1)}s`}
              label="Scan length"
              max={4}
              min={0.4}
              onChange={(scanSeconds) => update({ scanSeconds })}
              step={0.1}
              value={config.scanSeconds}
            />
            <Segmented
              onChange={(count: string) => update({ trackCount: Number(count) })}
              options={[
                ["6", "6 tracks"],
                ["40", "40"],
                ["137", "137"],
                ["2000", "2,000"],
              ]}
              value={String(config.trackCount)}
            />
          </Group>

          {config.variant === "tune-in" && (
            <>
              <Group
                title="While scanning"
                note="The glyph is the only thing on screen. Amber means running, so it lights up only now."
              >
                <Toggle
                  checked={config.tuning}
                  label="Tuning"
                  note="Columns power on left to right, then a slow wave travels through them until the scan ends."
                  onChange={(tuning) => update({ tuning })}
                />
                <Segmented
                  onChange={(tuningStyle: ScanConfig["tuningStyle"]) => update({ tuningStyle })}
                  options={[
                    ["shimmer", "Shimmer"],
                    ["wave", "Wave"],
                  ]}
                  value={config.tuningStyle}
                />
                <p className="text-meta text-tertiary">
                  {config.tuningStyle === "shimmer"
                    ? "The gray glyph fades into amber, then every dot twinkles on its own clock: its own speed, phase and low point, so nothing travels in a direction."
                    : "Columns power on left to right, then a slow wave travels through them."}
                </p>
                <Toggle
                  checked={config.tally}
                  label="Live tally (off for now)"
                  note="“Found 1,284 tracks” replaces the description and eases toward each new batch, like Liveline's lerp. Needs scan progress from the main process, which the app doesn't send yet."
                  onChange={(tally) => update({ tally })}
                />
              </Group>
              <Group
                title="Lock on"
                note="The scan ends. The glyph becomes the list's edge, so the library grows out of the thing you were watching."
              >
                <Segmented
                  onChange={(ending: string) => update({ fold: ending === "rule" })}
                  options={[
                    ["rule", "Becomes the rule"],
                    ["fade", "Fades out"],
                  ]}
                  value={config.fold ? "rule" : "fade"}
                />
                <p className="text-meta text-tertiary">
                  {config.fold
                    ? "Columns fold to one row of dots, then stretch into the column header's rule."
                    : "The glyph fades with the words; nothing travels to the list."}
                </p>
                <Segmented
                  onChange={(shell: ScanConfig["shell"]) => update({ shell })}
                  options={[
                    ["instant", "Shell instant"],
                    ["fade", "Fade"],
                    ["assemble", "Assemble"],
                  ]}
                  value={config.shell}
                />
                <Toggle
                  checked={config.titleFlight}
                  label="Title flies (off for now)"
                  note="“Add your music” travels into the page title and becomes “Tracks”. Family: fly instead of teleport."
                  onChange={(titleFlight) => update({ titleFlight })}
                />
                <Toggle
                  checked={config.countUp}
                  label="Count"
                  note="The count rolls up from 00, so the stat line keeps its width; when a digit is added, the rest of the line glides over. With the tally on, the tally's number flies in instead."
                  onChange={(countUp) => update({ countUp })}
                />
                <Toggle
                  checked={config.sound}
                  label="Lock-on sound"
                  note="A soft two-note chime when the scan ends. Honk-style; off by default."
                  onChange={(sound) => update({ sound })}
                />
              </Group>
              <Group
                title="Develop"
                note="One screenful of rows. The rest of the list is there at once."
              >
                <Toggle
                  checked={config.sweep}
                  label="Scan line"
                  note="The amber rule travels down the list and rows develop as it passes. Off: a plain cascade."
                  onChange={(sweep) => update({ sweep })}
                />
                <Toggle
                  checked={config.flash}
                  label="Row flash"
                  note="Each row lights like a selection as it arrives, a soft band crosses it left to right, and the highlight fades (after Alasdair Monk's copy feedback in Rex)."
                  onChange={(flash) => update({ flash })}
                />
                <Range
                  format={(value) => `${value}ms`}
                  label="Per row"
                  max={80}
                  min={20}
                  onChange={(rowStep) => update({ rowStep })}
                  step={2}
                  value={config.rowStep}
                />
                <Range
                  format={(value) => `${value}px`}
                  label="Rise"
                  max={8}
                  min={0}
                  onChange={(rise) => update({ rise })}
                  step={1}
                  value={config.rise}
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
              </Group>
              <Button onClick={() => update(tuneIn)} size="sm" type="button">
                Reset Tune in
              </Button>
            </>
          )}
          {config.variant === "current" && (
            <Button onClick={() => update(current)} size="sm" type="button">
              Reset
            </Button>
          )}
        </aside>
      </div>
    </StageContext>
  );
}

/** The router's root: the empty window, then the app shell around the Tracks page copy. */
function Stage() {
  const state = useContext(StageContext)!;
  const { config, phase, run, setPhase } = state;
  const reduced = config.reduced;
  const library = useMemo(() => fixtureLibrary(config.trackCount), [config.trackCount]);
  const [timeStore] = useState(createAudioTimeStore);
  const stageRef = useRef<HTMLDivElement>(null);
  const onboardingRef = useRef<HTMLDivElement>(null);
  const showLibrary = phase === "revealing" || phase === "done";
  const showOnboarding = phase !== "done";
  const tuning = config.variant === "tune-in" && config.tuning && phase === "scanning";

  useEffect(() => {
    if (phase !== "scanning") return;

    const timeout = setTimeout(
      () => {
        if (config.variant === "current") {
          markFirstScan();
          setPhase("done");
        } else setPhase("revealing");
      },
      (config.scanSeconds * 1000) / config.speed,
    );

    return () => clearTimeout(timeout);
  }, [phase, run, config.scanSeconds, config.speed, config.variant, setPhase]);

  useLayoutEffect(() => {
    if (phase !== "revealing") return;

    let cancelled = false;
    let frame = 0;
    const animations: Animation[] = [];

    // The list renders its rows a frame after mounting (the virtualizer measures first).
    const start = () => {
      if (cancelled) return;

      const stage = stageRef.current;

      if (!stage?.querySelector("#tracks tbody tr[data-entry-id]")) {
        frame = requestAnimationFrame(start);

        return;
      }

      const end = choreograph(stage, onboardingRef.current, config, animations);
      const timeout = setTimeout(() => !cancelled && setPhase("done"), end);

      cleanups.push(() => clearTimeout(timeout));
    };

    const cleanups: (() => void)[] = [];
    const stage = stageRef.current;
    frame = requestAnimationFrame(start);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup());
      animations.forEach((animation) => animation.cancel());
      stage
        ?.querySelectorAll("[data-scan-overlay], [data-scan-line]")
        .forEach((node) => node.remove());
    };
  }, [phase, run, config, setPhase]);

  return (
    <div
      className="relative h-screen min-w-0 flex-1 overflow-hidden [transform:translateZ(0)]"
      data-scan-reduced={reduced || undefined}
      key={run}
      ref={stageRef}
      // SAFETY: React passes this valid CSS custom property through to the DOM.
      style={{ "--lab-speed": config.speed } as CSSProperties}
    >
      <style>{labStyles}</style>
      {showLibrary && (
        <MusicLibraryContext.Provider value={library}>
          <PlaybackContext.Provider value={idlePlayback}>
            <PlaybackTimeContext.Provider value={timeStore}>
              <Shell />
            </PlaybackTimeContext.Provider>
          </PlaybackContext.Provider>
        </MusicLibraryContext.Provider>
      )}
      {showOnboarding && (
        <div
          aria-hidden={phase === "revealing" || undefined}
          className={cn(
            "absolute inset-0 z-30 flex flex-col bg-page",
            phase === "revealing" && "pointer-events-none",
          )}
          data-scan-onboarding
          inert={phase === "revealing"}
          ref={onboardingRef}
        >
          <div className="h-12 shrink-0" />
          <div className="flex flex-1 justify-center px-6 pt-54">
            <LibraryOnboarding
              actions={
                <Button
                  busy={phase !== "idle"}
                  onClick={() => setPhase("scanning")}
                  type="button"
                  variant="primary"
                >
                  Choose folder…
                </Button>
              }
              busy={phase !== "idle"}
              description={
                config.variant === "tune-in" && config.tally && phase !== "idle" ? (
                  <Tally
                    finished={phase === "revealing"}
                    reduced={reduced}
                    seconds={config.scanSeconds / config.speed}
                    total={config.trackCount}
                  />
                ) : (
                  "Choose a folder of audio files. Lume plays them where they are."
                )
              }
              title="Add your music"
              tuning={
                tuning || (phase === "revealing" && config.tuning) ? config.tuningStyle : false
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The found-so-far count while scanning. Batches arrive at uneven intervals; the shown number eases
 * 8% of the way to the latest total every frame, written to the DOM rather than through React.
 */
function Tally({
  finished,
  reduced,
  seconds,
  total,
}: {
  finished: boolean;
  reduced: boolean;
  seconds: number;
  total: number;
}) {
  const countRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useEffect(() => {
    const element = countRef.current;

    if (!element) return;

    if (finished) {
      shown.current = total;
      element.textContent = total.toLocaleString();

      return;
    }

    let target = 0;
    let frame = 0;
    const timeouts: number[] = [];
    const start = performance.now();

    // Uneven batches: quiet stretches, then bursts, ending just short of the total.
    let at = 0;
    let seed = total;

    while (at < seconds * 1000 * 0.92) {
      seed = (seed * 9301 + 49297) % 233280;
      const gap = 60 + (seed / 233280) * 260;
      at += gap;
      const share = Math.min(1, at / (seconds * 1000 * 0.92));

      timeouts.push(
        window.setTimeout(() => {
          target = Math.round(total * share * share * (3 - 2 * share));
        }, at),
      );
    }

    const tick = (now: number) => {
      if (reduced) shown.current = target;
      else shown.current += (target - shown.current) * 0.08;

      element.textContent = Math.round(shown.current).toLocaleString();

      if (now - start < seconds * 1000 + 600) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [finished, reduced, seconds, total]);

  return (
    <span data-slot="scan-tally">
      Found{" "}
      <span className="tabular-nums" data-slot="scan-tally-count" ref={countRef}>
        0
      </span>{" "}
      tracks in Music
    </span>
  );
}

function chime() {
  const context = new AudioContext();
  const now = context.currentTime;

  [659.25, 987.77].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.07;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.05, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.55);
  });

  window.setTimeout(() => void context.close(), 1200);
}

export function Shell() {
  return (
    <SidebarProvider className="h-full flex-col bg-page text-primary">
      <div className="relative flex min-h-0 flex-1 overflow-x-clip">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AudioPlayerControls queueOpen={false} toggleQueue={() => {}} />
          <div className="relative flex min-h-0 flex-1">
            <SidebarInset className="min-h-0 min-w-0 overflow-auto bg-page" data-scroll-container>
              <div className="flex min-h-0 flex-1 flex-col">
                <TracksPage />
              </div>
            </SidebarInset>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

const easeOut = "cubic-bezier(0.23, 1, 0.32, 1)";

const easeInOut = "cubic-bezier(0.645, 0.045, 0.355, 1)";

/** The box around an element's text, which is what a flying copy has to line up with. */
function textBox(element: HTMLElement) {
  const range = document.createRange();

  range.selectNodeContents(element);

  return range.getBoundingClientRect();
}

/** Motion's spring sampled into a CSS easing, as src/index.css does for spring.ui. */
function springEasing(visualDuration: number) {
  const [duration, easing] = spring(visualDuration, 0).toString().split("ms ");

  return { duration: Number(duration), easing: easing! };
}

/**
 * Tune in, from the moment the scan ends. Times are in milliseconds at 100% speed; every one is
 * divided by the speed control. Returns when the last animation ends.
 */
function choreograph(
  stage: HTMLElement,
  onboarding: HTMLElement | null,
  config: ScanConfig,
  animations: Animation[],
) {
  const speed = config.speed;

  const reduced = config.reduced;

  // Durations from the skills and the readings rather than the app's springs: entries under
  // 300ms (250, ease-out), exits shorter than entries (150), small colour changes on `ease`
  // (150), on-screen moves on ease-in-out, staggers of 30–80ms (the brief's 40ms and 4px for
  // rows), and the player lab's "Tape" spring for the one large move. Every step overlaps the
  // next, as Family's transitions do, so nothing is ever left alone on screen.
  const enter = 250;

  const exit = 150;

  const lockDuration = 150;

  const foldDuration = 160;

  const foldStagger = 2;

  const stageBox = stage.getBoundingClientRect();

  const run = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(keyframes, {
      fill: "both",
      ...options,
      delay: (Number(options.delay) || 0) / speed,
      duration: Number(options.duration) / speed,
    });

    animations.push(animation);

    return animation;
  };

  const list = stage.querySelector<HTMLElement>("#tracks")!;
  const scroller = list.closest<HTMLElement>("[data-scroll-container]")!;
  const thead = list.querySelector("thead")!;
  const header = stage.querySelector("[data-slot=page-header]");
  const sidebar = stage.querySelector("[data-slot=sidebar-container]");
  const player = stage.querySelector("header[aria-label=Player]");
  const count = stage.querySelector<HTMLElement>("[data-slot=track-count]");
  const visibleRows = Math.ceil((scroller.clientHeight - 36) / 40);

  const rows = Array.from(list.querySelectorAll<HTMLElement>("tbody tr[data-entry-id]")).filter(
    (row) => Number(row.getAttribute("aria-rowindex")) - 2 < visibleRows,
  );

  if (config.sound) chime();

  if (reduced) {
    if (onboarding)
      run(onboarding, [{ opacity: 1 }, { opacity: 0 }], { duration: exit, easing: easeOut });

    return exit / speed;
  }

  const fly = springEasing(0.34);
  const lit = onboarding?.querySelector("[data-slot=scan-glyph-lit]");
  const glyph = onboarding?.querySelector("[data-slot=scan-glyph-frame]");

  // The lock (every lit dot easing to full amber) and the fold run together, from the moment the
  // scan ends; the outermost columns start 19.5 × 2ms late, so the fold ends when they do.
  const lock = lit ? lockDuration : 0;

  const foldEnd = config.fold ? foldDuration + 19.5 * foldStagger : 0;

  const clear = 80;

  const land = config.fold ? foldEnd + fly.duration * 0.62 : clear + enter;
  const theadBox = thead.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const ruleTop = theadBox.bottom - 1 - stageBox.top;
  const ruleLeft = scrollerBox.left - stageBox.left;
  const ruleWidth = scrollerBox.width;

  // 1. The words leave, softer than they arrived, as the glyph starts to fold.
  onboarding?.querySelectorAll("[data-onboarding-part]").forEach((part, index) =>
    run(
      part,
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-4px)" },
      ],
      { delay: index * 30, duration: exit, easing: easeOut },
    ),
  );

  // 2. Lock and fold: the dots brighten to amber while every column slides to the middle row,
  // the centre column first.
  if (lit) {
    const parts = [lit, ...lit.querySelectorAll("[data-column], rect")];
    const from = parts.map((part) => getComputedStyle(part).opacity);

    lit.setAttribute("data-locked", "");
    parts.forEach((part, index) =>
      run(part, [{ opacity: from[index] }, { opacity: 1 }], {
        duration: lockDuration,
        easing: "ease",
      }),
    );
  }

  const base = glyph?.querySelector("[data-slot=scan-glyph]");

  // The gray dots stay under the amber until it is fully opaque, so nothing dips on the way.
  if (base && lit) run(base, [{ opacity: 1 }, { opacity: 0 }], { delay: lock, duration: 1 });

  if (config.fold && glyph) {
    // Both layers fold, so no gray dot is left behind while the amber is still coming up.
    const columns = glyph.querySelectorAll<SVGGElement>("[data-column]");

    columns.forEach((column) => {
      const index = Number(column.dataset.column);
      const distance = Math.abs(index - 19.5);

      column.querySelectorAll<SVGRectElement>("rect").forEach((rect) => {
        const offset = 10 - Number(rect.dataset.y);

        run(rect, [{ transform: "translateY(0)" }, { transform: `translateY(${offset}px)` }], {
          delay: distance * foldStagger,
          duration: foldDuration,
          easing: easeInOut,
        });
      });
    });

    // 3. Fly: a dotted strip takes the folded row's place and stretches into the rule.
    const glyphBox = glyph.getBoundingClientRect();
    const strip = document.createElement("div");

    strip.dataset.scanOverlay = "";
    strip.style.cssText = `position:absolute;z-index:40;left:${glyphBox.left - stageBox.left}px;top:${glyphBox.top - stageBox.top + 10}px;width:198px;height:3px;transform-origin:0 0;pointer-events:none`;
    strip.innerHTML =
      '<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,var(--color-accent-solid) 0 3px,transparent 3px 5px)"></div><div data-solid style="position:absolute;inset:0;background:var(--color-accent-solid);opacity:0"></div>';
    stage.append(strip);
    run(strip, [{ opacity: 0 }, { opacity: 1 }], { delay: foldEnd - 1, duration: 1 });
    run(glyph, [{ opacity: 1 }, { opacity: 0 }], { delay: foldEnd, duration: 1 });

    const dx = ruleLeft - (glyphBox.left - stageBox.left);
    const dy = ruleTop - (glyphBox.top - stageBox.top + 10);

    run(
      strip,
      [
        { transform: "translate(0, 0) scale(1, 1)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${ruleWidth / 198}, ${1 / 3})` },
      ],
      { delay: foldEnd, duration: fly.duration, easing: fly.easing, fill: "forwards" },
    );
    run(strip.querySelector("[data-solid]")!, [{ opacity: 0 }, { opacity: 1 }], {
      delay: foldEnd + fly.duration * 0.25,
      duration: fly.duration * 0.45,
      easing: easeOut,
    });
    run(strip, [{ opacity: 1 }, { opacity: 0 }], {
      delay: land + 40,
      duration: 1,
      fill: "forwards",
    });
  } else if (glyph) {
    run(glyph, [{ opacity: 1 }, { opacity: 0 }], { duration: exit, easing: easeOut });
  }

  // 4. The empty window clears to the shell.
  if (onboarding) {
    run(
      onboarding,
      [{ backgroundColor: "var(--color-bg-page)" }, { backgroundColor: "transparent" }],
      {
        delay: clear,
        duration: config.shell === "instant" ? 1 : 200,
        easing: easeOut,
      },
    );
  }

  if (config.shell === "assemble") {
    if (sidebar)
      run(
        sidebar,
        [
          { opacity: 0, transform: "translateX(-12px)" },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { delay: clear + 40, duration: enter, easing: easeOut },
      );

    if (player)
      run(
        player,
        [
          { opacity: 0, transform: "translateY(-8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { delay: clear + 100, duration: enter, easing: easeOut },
      );
  }

  // 5. The header arrives as the rule lands. The title and the count can fly in from the window.
  const titleGroup = header?.children[0];
  const pageTitle = titleGroup?.querySelector<HTMLElement>("h1");
  const stat = titleGroup?.querySelector("p");
  const sourceTitle = onboarding?.querySelector<HTMLElement>("h1");
  const tallyCount = onboarding?.querySelector<HTMLElement>("[data-slot=scan-tally-count]");

  const arrive = (element: Element, delay: number) =>
    run(
      element,
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { delay, duration: enter, easing: easeOut },
    );

  /** A copy of `source`'s text travels to `target`'s, scaling between their sizes on the spring. */
  const flyText = (source: HTMLElement, target: HTMLElement, label: string, delay: number) => {
    const from = textBox(source);
    const to = textBox(target);
    const style = getComputedStyle(source);
    const scale = parseFloat(getComputedStyle(target).fontSize) / parseFloat(style.fontSize);
    const clone = document.createElement("div");

    clone.dataset.scanOverlay = "";
    clone.style.cssText = `position:absolute;z-index:45;left:${from.left - stageBox.left}px;top:${from.top - stageBox.top}px;transform-origin:0 0;pointer-events:none;white-space:nowrap;font:${style.font};line-height:normal;letter-spacing:${style.letterSpacing};color:${style.color}`;

    const before = document.createElement("span");
    const after = document.createElement("span");

    before.textContent = source.textContent;
    after.textContent = label;
    after.style.cssText = "position:absolute;left:0;top:0";
    clone.append(before, after);
    stage.append(clone);

    const changes = before.textContent !== label;
    const arrival = delay + fly.duration * 0.9;

    run(source, [{ opacity: 1 }, { opacity: 0 }], { delay, duration: 1 });
    run(clone, [{ opacity: 0 }, { opacity: 1 }], { delay: delay - 1, duration: 1 });
    run(
      clone,
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`,
        },
      ],
      { delay, duration: fly.duration, easing: fly.easing, fill: "forwards" },
    );

    if (changes) {
      run(before, [{ opacity: 1 }, { opacity: 0 }], {
        delay: delay + fly.duration * 0.12,
        duration: fly.duration * 0.4,
        easing: easeOut,
      });
      run(after, [{ opacity: 0 }, { opacity: 1 }], {
        delay: delay + fly.duration * 0.22,
        duration: fly.duration * 0.45,
        easing: easeOut,
      });
    } else run(after, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });

    run(target, [{ opacity: 0 }, { opacity: 1 }], { delay: arrival, duration: 1 });
    run(clone, [{ opacity: 1 }, { opacity: 0 }], {
      delay: arrival,
      duration: 1,
      fill: "forwards",
    });
  };

  if (header)
    Array.from(header.children)
      .slice(1)
      .forEach((child, index) => arrive(child, land - 90 + index * 50));

  if (config.titleFlight && sourceTitle && pageTitle) flyText(sourceTitle, pageTitle, "Tracks", 40);
  else if (pageTitle) arrive(pageTitle, land - 140);

  if (stat) arrive(stat, land - 100);

  run(thead, [{ opacity: 0 }, { opacity: 1 }], {
    delay: land - 60,
    duration: enter,
    easing: easeOut,
  });

  // Two digits from the start, so the line doesn't jump as the count begins. When a digit or a
  // comma is added, the rest of the line glides over instead of jumping.
  const rest = stage.querySelector<HTMLElement>("[data-slot=track-stat-rest]");

  const setCount = (value: number, glide = true) => {
    if (!count) return;

    const text = value < 10 ? `0${value}` : value.toLocaleString();

    if (text === count.textContent) return;

    const before = count.getBoundingClientRect().width;

    count.textContent = text;

    const shift = count.getBoundingClientRect().width - before;

    if (glide && shift && rest)
      animations.push(
        rest.animate([{ transform: `translateX(${-shift}px)` }, { transform: "translateX(0)" }], {
          composite: "add",
          duration: exit / speed,
          easing: easeInOut,
        }),
      );
  };

  if (config.countUp && config.tally && tallyCount && count)
    flyText(tallyCount, count, tallyCount.textContent ?? "", 110);
  else if (config.countUp && count) {
    const target = Number(count.textContent?.replace(/\D/g, "")) || 0;
    const startAt = performance.now() + land / speed;
    const duration = Math.min(800, enter + target * 4) / speed;

    const tick = (now: number) => {
      if (!count.isConnected) return;

      const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
      const eased = 1 - (1 - progress) ** 3;

      setCount(Math.round(target * eased));

      if (progress < 1) requestAnimationFrame(tick);
    };

    setCount(0, false);
    requestAnimationFrame(tick);
  }

  // 6. Develop: the rule travels down one screenful; each row resolves as the line crosses it.
  const step = config.rowStep;

  const rowsIn = (index: number) => land + (index + 0.5) * step;

  const rowKeyframes = (blur: number, rise: number): Keyframe[] => [
    { opacity: 0, transform: `translateY(${rise}px)`, filter: blur ? `blur(${blur}px)` : "none" },
    { opacity: 1, transform: "translateY(0)", filter: blur ? "blur(0)" : "none" },
  ];

  // Row flash: a neutral highlight on the row, a band crossing it, then the highlight fades
  // (the brief's 600ms highlight fade; the band is an on-screen move, so ease-in-out).
  const flashHighlight = 600;

  const flashBand = 300;

  const flash = (row: HTMLElement, at: number) => {
    const box = row.getBoundingClientRect();
    const bandWidth = Math.round(box.width * 0.35);
    const wash = document.createElement("div");
    const band = document.createElement("div");

    wash.dataset.scanOverlay = "";
    wash.style.cssText = `position:absolute;z-index:15;left:${box.left - stageBox.left}px;top:${box.top - stageBox.top}px;width:${box.width}px;height:${box.height}px;border-radius:6px;overflow:hidden;pointer-events:none;opacity:0;background:color-mix(in oklab, var(--color-text-primary) 5%, transparent)`;
    band.style.cssText = `position:absolute;top:0;bottom:0;left:0;width:${bandWidth}px;background:linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-text-primary) 9%, transparent), transparent)`;
    wash.append(band);
    stage.append(wash);

    run(wash, [{ opacity: 0 }, { opacity: 1 }], { delay: at, duration: 120, easing: easeOut });
    run(wash, [{ opacity: 1 }, { opacity: 0 }], {
      delay: at + 120 + flashBand * 0.5,
      duration: flashHighlight,
      easing: easeOut,
      fill: "forwards",
    });
    run(
      band,
      [{ transform: `translateX(${-bandWidth}px)` }, { transform: `translateX(${box.width}px)` }],
      { delay: at + 60, duration: flashBand, easing: easeInOut },
    );
  };

  rows.forEach((row) => {
    const index = Number(row.getAttribute("aria-rowindex")) - 2;
    const at = config.sweep ? rowsIn(index) : land + index * step;

    if (config.flash) flash(row, at);

    run(row, rowKeyframes(config.blur, config.rise), {
      delay: at,
      duration: enter,
      easing: easeOut,
    });
  });

  const shownRows = Math.min(
    visibleRows,
    Number(list.querySelector("table")?.getAttribute("aria-rowcount")) - 1 || rows.length,
  );

  const sweepDuration = shownRows * step;

  if (config.sweep) {
    const line = document.createElement("div");

    line.dataset.scanLine = "";
    line.style.cssText = `position:absolute;z-index:20;left:${ruleLeft}px;top:${ruleTop - 31}px;width:${ruleWidth}px;height:32px;pointer-events:none;background:linear-gradient(to bottom, transparent, color-mix(in oklab, var(--color-accent-solid) 7%, transparent));border-bottom:1px solid var(--color-accent-solid)`;
    stage.append(line);

    const travel = 4 + shownRows * 40;

    run(line, [{ opacity: 0 }, { opacity: 1 }], { delay: land, duration: 1 });
    run(line, [{ transform: "translateY(0)" }, { transform: `translateY(${travel}px)` }], {
      delay: land,
      duration: sweepDuration,
      easing: "linear",
      fill: "forwards",
    });
    run(line, [{ opacity: 1 }, { opacity: 0 }], {
      delay: land + sweepDuration - 60,
      duration: exit,
      easing: easeOut,
      fill: "forwards",
    });
  }

  const lastRowIn = config.sweep
    ? rowsIn(shownRows - 1)
    : land + (Math.min(rows.length, shownRows) - 1) * step;

  const last = Math.max(
    config.sweep ? land + sweepDuration + exit : lastRowIn + enter,
    config.flash ? lastRowIn + 120 + flashBand * 0.5 + flashHighlight : 0,
  );

  return Math.max(last, land + 800) / speed;
}

const labStyles = `
@keyframes lab-row-in { from { opacity: 0; transform: translateY(4px) } }
@keyframes lab-row-fade { from { opacity: 0 } }
@keyframes lab-power { from { opacity: 0 } }
@keyframes lab-listen { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
[data-tuning=wave] [data-column] {
  animation:
    lab-power calc(150ms / var(--lab-speed)) cubic-bezier(0.23, 1, 0.32, 1) calc(var(--column) * 6ms / var(--lab-speed)) both,
    lab-listen calc(1400ms / var(--lab-speed)) cubic-bezier(0.645, 0.045, 0.355, 1) calc((300ms + var(--column) * 35ms) / var(--lab-speed)) infinite;
}
@keyframes lab-twinkle { 0%, 100% { opacity: var(--twinkle-low) } 50% { opacity: 1 } }
[data-tuning=shimmer] {
  animation: lab-power calc(250ms / var(--lab-speed)) cubic-bezier(0.23, 1, 0.32, 1) both;
}
[data-tuning=shimmer] rect {
  animation: lab-twinkle calc(var(--twinkle-duration) / var(--lab-speed)) cubic-bezier(0.645, 0.045, 0.355, 1) calc(var(--twinkle-delay) / var(--lab-speed)) infinite;
}
[data-tuning][data-locked] [data-column],
[data-tuning][data-locked] rect {
  animation: none;
}
[data-scan-reduced] [data-tuning=shimmer] {
  animation: lab-power calc(150ms / var(--lab-speed)) ease-out both;
}
[data-scan-reduced] [data-tuning=shimmer] rect {
  animation: none;
}
[data-scan-reduced] [data-tuning=wave] [data-column] {
  animation: lab-power calc(150ms / var(--lab-speed)) ease-out both;
}
`;
