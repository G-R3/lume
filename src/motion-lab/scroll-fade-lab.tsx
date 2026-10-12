import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createAudioTimeStore } from "@/hooks/use-media-element";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { PlaybackContext, PlaybackTimeContext } from "@/hooks/use-playback";
import { Group, Range, Segmented, Toggle } from "@/motion-lab/controls";
import { fixtureLibrary } from "@/motion-lab/scan/fixture-library";
import { Shell } from "@/motion-lab/scan/scan-lab";
import { idlePlayback } from "@/states/playback-fixture";

type FadeConfig = {
  enabled: boolean;
  curve: "paper" | "eased" | "linear";
  size: number;
  hideAtEnd: boolean;
  gutter: number;
  trackCount: number;
};

/** What ships: 1:1 with the fade behind the selection bar on Paper's Direction frames. */
const shipped: FadeConfig = {
  enabled: true,
  curve: "paper",
  size: 96,
  hideAtEnd: true,
  gutter: 12,
  trackCount: 137,
};

const storageKey = "lume-motion-lab-fade";

// Content visibility from the top of the fade (0) to the edge (1).
const curves: Record<FadeConfig["curve"], readonly (readonly [number, number])[]> = {
  // Paper: the page colour at 0%, 85% and 100% over the list, so content at 1, 0.15 and 0
  paper: [
    [0, 1],
    [0.55, 0.15],
    [1, 0],
  ],
  // Andreas Larsen's easing gradient ("scrim")
  eased: [
    [0, 1],
    [0.081, 0.987],
    [0.155, 0.951],
    [0.225, 0.896],
    [0.29, 0.825],
    [0.353, 0.741],
    [0.41, 0.648],
    [0.466, 0.55],
    [0.521, 0.45],
    [0.576, 0.352],
    [0.632, 0.259],
    [0.69, 0.175],
    [0.752, 0.104],
    [0.821, 0.049],
    [0.901, 0.013],
    [1, 0],
  ],
  linear: [
    [0, 1],
    [1, 0],
  ],
};

const curveNotes: Record<FadeConfig["curve"], string> = {
  paper: "Paper's selection-bar backdrop: content at 15% by 55% of the way down, gone at the edge.",
  eased: "An eased S-curve (Andreas Larsen's easing gradient): softer, no visible band.",
  linear: "Straight 1 → 0, for comparison. The band where the slope changes tends to show.",
};

function loadConfig(): FadeConfig {
  try {
    return { ...shipped, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {
    return shipped;
  }
}

/**
 * A bottom fade for the Tracks list, rebuilt from the controls. Deferred from the app until the
 * floating selection bar is designed.
 */
function fadeStyles(config: FadeConfig) {
  if (!config.enabled) return "";

  const fade = config.hideAtEnd ? "var(--scroll-fade)" : `${config.size}px`;

  const stops = curves[config.curve]
    .map(([at, alpha]) => `rgb(0 0 0 / ${alpha}) calc(100% - ${fade} * ${1 - at})`)
    .join(", ");

  return `
@property --scroll-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
@keyframes lab-scroll-fade { from { --scroll-fade: ${config.size}px } to { --scroll-fade: 0px } }
[data-fade-stage] [data-scroll-container]:has(> #tracks) {
  mask-image: linear-gradient(to bottom, ${stops}), linear-gradient(#000, #000);
  mask-size: calc(100% - ${config.gutter}px) 100%, ${config.gutter}px 100%;
  mask-position: left top, right top;
  mask-repeat: no-repeat;
  ${config.hideAtEnd ? `animation: lab-scroll-fade linear both; animation-timeline: scroll(self); animation-range: calc(100% - ${config.size}px) 100%;` : ""}
}`;
}

const FadeContext = createContext<FadeConfig>(shipped);

export function ScrollFadeLab({ viewSwitch }: { viewSwitch: ReactNode }) {
  const [config, setConfig] = useState(loadConfig);
  const update = (patch: Partial<FadeConfig>) => setConfig((value) => ({ ...value, ...patch }));
  const [queryClient] = useState(() => new QueryClient());

  const [router] = useState(() =>
    createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: createRootRoute({ component: FadeStage }),
    }),
  );

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(config)), [config]);

  return (
    <FadeContext value={config}>
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
              Scroll fade: a signifier that more of the list is below. Scroll the list on the left;
              the sidebar uses the shipped fade.
            </p>
          </div>
          {viewSwitch}
          <Group title="Fade" note="Shipped: Paper's curve, 96px, hidden at the end, 12px gutter.">
            <Toggle
              checked={config.enabled}
              label="Fade"
              note="Off to compare with a hard edge."
              onChange={(enabled) => update({ enabled })}
            />
            <Segmented
              onChange={(curve: FadeConfig["curve"]) => update({ curve })}
              options={[
                ["paper", "Paper"],
                ["eased", "Eased"],
                ["linear", "Linear"],
              ]}
              value={config.curve}
            />
            <p className="text-meta text-tertiary">{curveNotes[config.curve]}</p>
            <Range
              format={(value) => `${value}px`}
              label="Height"
              max={160}
              min={32}
              onChange={(size) => update({ size })}
              step={8}
              value={config.size}
            />
            <Toggle
              checked={config.hideAtEnd}
              label="Hide at the end"
              note="The fade shrinks to nothing over the last stretch of scrolling, so the last row is never faded. Off: always on while the list overflows."
              onChange={(hideAtEnd) => update({ hideAtEnd })}
            />
            <Segmented
              onChange={(gutter: string) => update({ gutter: Number(gutter) })}
              options={[
                ["0", "No gutter"],
                ["12", "12px scrollbar gutter"],
              ]}
              value={String(config.gutter)}
            />
            <Segmented
              onChange={(count: string) => update({ trackCount: Number(count) })}
              options={[
                ["6", "6 tracks"],
                ["40", "40"],
                ["137", "137"],
              ]}
              value={String(config.trackCount)}
            />
            <p className="text-meta text-tertiary">
              6 tracks don't overflow, so there is no fade at all.
            </p>
          </Group>
          <Button onClick={() => update(shipped)} size="sm" type="button">
            Reset to shipped
          </Button>
        </aside>
      </div>
    </FadeContext>
  );
}

function FadeStage() {
  const config = useContext(FadeContext);
  const library = useMemo(() => fixtureLibrary(config.trackCount), [config.trackCount]);
  const [timeStore] = useState(createAudioTimeStore);

  return (
    <div
      className="relative h-screen min-w-0 flex-1 overflow-hidden [transform:translateZ(0)]"
      data-fade-stage
    >
      <style>{fadeStyles(config)}</style>
      <MusicLibraryContext.Provider value={library}>
        <PlaybackContext.Provider value={idlePlayback}>
          <PlaybackTimeContext.Provider value={timeStore}>
            <Shell />
          </PlaybackTimeContext.Provider>
        </PlaybackContext.Provider>
      </MusicLibraryContext.Provider>
    </div>
  );
}
