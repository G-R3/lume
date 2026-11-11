import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { LibrarySnapshot } from "../../shared/lib";

// Picking, cancelling and failing to add the first folder belong to the add-source mutation.
// This model only remembers what the mutation cannot: that the first-run screen still owes the
// library a reveal, and which list that reveal runs on.
export type Onboarding =
  | { phase: "none" }
  | { phase: "first-run" }
  | { phase: "waiting-for-list" }
  | { phase: "revealing"; list: HTMLElement | null };

export type OnboardingEvent =
  | { type: "library-shown"; kind: LibrarySnapshot["kind"] | undefined; onTracksRoute: boolean }
  | { type: "list-ready"; list: HTMLElement | null }
  | { type: "reveal-ended" };

const none = { phase: "none" } as const;

const firstRun = { phase: "first-run" } as const;

const waitingForList = { phase: "waiting-for-list" } as const;

// Only the tracks page reports a list, so any other route fades the first-run screen out.
const fadeOut = { phase: "revealing", list: null } as const;

// Every ignored event returns `state` itself, which keeps a running reveal from restarting.
export function stepOnboarding(state: Onboarding, event: OnboardingEvent): Onboarding {
  switch (event.type) {
    case "library-shown":
      if (event.kind === "first-run") return state.phase === "first-run" ? state : firstRun;

      if (event.kind === undefined) return state;

      if (state.phase === "first-run") return event.onTracksRoute ? waitingForList : fadeOut;

      if (state.phase === "waiting-for-list" && !event.onTracksRoute) return fadeOut;

      return state;
    case "list-ready":
      return state.phase === "waiting-for-list" ? { phase: "revealing", list: event.list } : state;
    case "reveal-ended":
      return state.phase === "revealing" ? none : state;
  }
}

export function useOnboarding(kind: LibrarySnapshot["kind"] | undefined, onTracksRoute: boolean) {
  const [onboarding, dispatch] = useReducer(stepOnboarding, none);
  const shown = { type: "library-shown", kind, onTracksRoute } as const;

  // Stepped during render, so the commit that first shows the library already has the
  // first-run screen covering it.
  if (stepOnboarding(onboarding, shown) !== onboarding) dispatch(shown);

  const onListReady = useCallback(
    (list: HTMLElement | null) => dispatch({ type: "list-ready", list }),
    [],
  );

  const onRevealEnd = useCallback(() => dispatch({ type: "reveal-ended" }), []);
  const isRevealing = onboarding.phase === "revealing" && onboarding.list !== null;
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
