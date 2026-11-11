import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { LibrarySnapshot } from "../../shared/lib";

export type Onboarding =
  | { phase: "none" }
  | { phase: "first-run" }
  | { phase: "waiting-for-list" }
  | { phase: "revealing"; list: HTMLElement }
  | { phase: "fading-out" };

export type OnboardingEvent =
  | { type: "library-shown"; kind: LibrarySnapshot["kind"] | undefined; onTracksRoute: boolean }
  | { type: "list-ready"; list: HTMLElement | null }
  | { type: "reveal-ended" };

const none = { phase: "none" } as const;

const firstRun = { phase: "first-run" } as const;

const waitingForList = { phase: "waiting-for-list" } as const;

const fadingOut = { phase: "fading-out" } as const;

export function stepOnboarding(state: Onboarding, event: OnboardingEvent): Onboarding {
  switch (event.type) {
    case "library-shown":
      if (event.kind === "first-run") return state.phase === "first-run" ? state : firstRun;

      if (event.kind === undefined) return state;

      if (state.phase === "first-run") return event.onTracksRoute ? waitingForList : fadingOut;

      if (state.phase === "waiting-for-list" && !event.onTracksRoute) return fadingOut;

      return state;
    case "list-ready":
      if (state.phase !== "waiting-for-list") return state;

      return event.list ? { phase: "revealing", list: event.list } : fadingOut;
    case "reveal-ended":
      return state.phase === "revealing" || state.phase === "fading-out" ? none : state;
  }
}

export function useOnboarding(kind: LibrarySnapshot["kind"] | undefined, onTracksRoute: boolean) {
  const [onboarding, dispatch] = useReducer(stepOnboarding, none);
  const shown = { type: "library-shown", kind, onTracksRoute } as const;

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
