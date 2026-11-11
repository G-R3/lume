// @vitest-environment happy-dom

import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished } from "vite-plus/test";
import type { LibrarySnapshot } from "../../shared/lib";
import {
  type Onboarding,
  type OnboardingEvent,
  stepOnboarding,
  useOnboarding,
} from "./use-onboarding";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const table = document.createElement("table");

const otherTable = document.createElement("table");

const shown = (kind: "first-run" | "library" | undefined, onTracksRoute = true) =>
  ({ type: "library-shown", kind, onTracksRoute }) as const;

const ready = (list: HTMLElement | null) => ({ type: "list-ready", list }) as const;

function run(events: OnboardingEvent[], state: Onboarding = { phase: "none" }) {
  return events.reduce(stepOnboarding, state);
}

it("reveals the tracks list once the first folder turns first run into a library", () => {
  expect(run([shown("first-run"), shown("library"), ready(table)])).toEqual({
    list: table,
    phase: "revealing",
  });
  expect(
    run([shown("first-run"), shown("library"), ready(table), { type: "reveal-ended" }]),
  ).toEqual({ phase: "none" });
});

it("stays on first run through cancels, errors and loading", () => {
  expect(
    run([shown("first-run"), shown("first-run"), shown(undefined), shown("first-run")]),
  ).toEqual({ phase: "first-run" });
});

it("never reveals a library that was open at launch", () => {
  expect(run([shown(undefined), shown("library"), ready(table), { type: "reveal-ended" }])).toEqual(
    {
      phase: "none",
    },
  );
});

it("fades first run out when the library arrives away from the tracks page", () => {
  const fade = { phase: "fading-out" };

  expect(run([shown("first-run"), shown("library", false)])).toEqual(fade);
  expect(run([shown("first-run"), shown("library"), shown("library", false)])).toEqual(fade);
});

it("fades first run out when the tracks page has no list to reveal", () => {
  expect(run([shown("first-run"), shown("library"), ready(null)])).toEqual({ phase: "fading-out" });
  expect(
    run([shown("first-run"), shown("library"), ready(null), { type: "reveal-ended" }]),
  ).toEqual({ phase: "none" });
});

it("keeps a running reveal when readiness or the route is reported again", () => {
  const revealing = run([shown("first-run"), shown("library"), ready(table)]);

  for (const event of [ready(otherTable), ready(null), shown("library", false)]) {
    expect(stepOnboarding(revealing, event)).toBe(revealing);
  }
});

it("ignores readiness and reveal ends outside a reveal", () => {
  for (const state of [
    run([]),
    run([shown("first-run")]),
    run([shown("first-run"), shown("library")]),
  ]) {
    expect(stepOnboarding(state, { type: "reveal-ended" })).toBe(state);
  }

  expect(stepOnboarding(run([]), ready(table))).toEqual({ phase: "none" });
  expect(stepOnboarding(run([shown("first-run")]), ready(table))).toEqual({ phase: "first-run" });
});

it("accepts readiness that the library page reports in the commit that first shows it", () => {
  const phases: Onboarding["phase"][] = [];
  const root = createRoot(document.createElement("div"));
  onTestFinished(() => act(() => root.unmount()));

  function EmptyTracksPage({ onListReady }: { onListReady: (list: HTMLElement | null) => void }) {
    useLayoutEffect(() => onListReady(null), [onListReady]);

    return null;
  }

  function App({ kind }: { kind: LibrarySnapshot["kind"] }) {
    const { onboarding, reveal } = useOnboarding(kind, true);
    phases.push(onboarding.phase);

    return kind === "library" && <EmptyTracksPage onListReady={reveal.onListReady} />;
  }

  act(() => root.render(<App kind="first-run" />));
  act(() => root.render(<App kind="library" />));

  expect(phases.at(-1)).toBe("fading-out");
});
