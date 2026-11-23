import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

export type LibraryStage = "first-run" | "scanning" | "library";

export type Onboarding =
  | { phase: "none" }
  | { phase: "first-run" }
  | { phase: "waiting-for-list" }
  | { phase: "revealing"; list: HTMLElement }
  | { phase: "fading-out" };

export type OnboardingEvent =
  | { type: "library-shown"; stage: LibraryStage | undefined; onTracksRoute: boolean }
  | { type: "list-ready"; list: HTMLElement | null }
  | { type: "reveal-ended" };

const NONE = { phase: "none" } as const;

const FIRST_RUN = { phase: "first-run" } as const;

const WAITING_FOR_LIST = { phase: "waiting-for-list" } as const;

const FADING_OUT = { phase: "fading-out" } as const;

export function stepOnboarding(state: Onboarding, event: OnboardingEvent): Onboarding {
  switch (event.type) {
    case "library-shown":
      if (event.stage === "first-run") return state.phase === "first-run" ? state : FIRST_RUN;

      if (event.stage === undefined || event.stage === "scanning") return state;

      if (state.phase === "first-run") return event.onTracksRoute ? WAITING_FOR_LIST : FADING_OUT;

      if (state.phase === "waiting-for-list" && !event.onTracksRoute) return FADING_OUT;

      return state;
    case "list-ready":
      if (state.phase !== "waiting-for-list") return state;

      return event.list ? { phase: "revealing", list: event.list } : FADING_OUT;
    case "reveal-ended":
      return state.phase === "revealing" || state.phase === "fading-out" ? NONE : state;
  }
}

export function useOnboarding(stage: LibraryStage | undefined, onTracksRoute: boolean) {
  const [onboarding, dispatch] = useReducer(stepOnboarding, NONE);
  const shown = { type: "library-shown", stage, onTracksRoute } as const;

  if (stepOnboarding(onboarding, shown) !== onboarding) dispatch(shown);

  const onListReady = useCallback(
    (list: HTMLElement | null) => dispatch({ type: "list-ready", list }),
    [],
  );

  const onRevealEnd = useCallback(() => dispatch({ type: "reveal-ended" }), []);
  const isRevealing = onboarding.phase === "revealing";
  const reveal = useMemo(() => ({ isRevealing, onListReady }), [isRevealing, onListReady]);

  return { onboarding, onRevealEnd, reveal };
}

export const LibraryRevealContext = createContext<{
  isRevealing: boolean;
  onListReady: (list: HTMLElement | null) => void;
} | null>(null);

export function useLibraryReveal() {
  const context = useContext(LibraryRevealContext);

  if (!context) throw new Error("useLibraryReveal must be used within LibraryRevealContext");

  return context;
}
