import { expect, it } from "vite-plus/test";
import { type Onboarding, type OnboardingEvent, stepOnboarding } from "./use-onboarding";

// SAFETY: the model stores the list for the reveal and never reads it, so any object stands in.
const table = {} as HTMLElement;

// SAFETY: as above, a distinct stand-in for a second list.
const otherTable = {} as HTMLElement;

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
  const fade = { list: null, phase: "revealing" };

  expect(run([shown("first-run"), shown("library", false)])).toEqual(fade);
  expect(run([shown("first-run"), shown("library"), shown("library", false)])).toEqual(fade);
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
