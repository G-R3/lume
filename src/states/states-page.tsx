import { useCallback, useEffect, useState } from "react";
import { measureSpecimens, type SpecimenResult } from "@/states/measure";
import { MeasurementsContext } from "@/states/measurements-context";
import {
  ButtonSection,
  FieldSection,
  NavRowSection,
  RoughDataSection,
  SwitchSection,
  TrackRowSection,
} from "@/states/sections";

declare global {
  interface Window {
    /** Used by scripts/sandbox/measure.ts after it forces hover and focus states. */
    lumeStates?: { measure: () => SpecimenResult[] };
  }
}

const measureEvent = "lume-states:measure";

export function StatesPage() {
  const [results, setResults] = useState<ReadonlyMap<string, SpecimenResult>>(new Map());

  const measure = useCallback(() => {
    const measured = measureSpecimens();
    setResults(new Map(measured.map((result) => [result.id, result])));

    return measured;
  }, []);

  useEffect(() => {
    window.lumeStates = { measure };

    const remeasure = () => measure();
    void document.fonts.ready.then(remeasure);
    window.addEventListener(measureEvent, remeasure);
    window.addEventListener("resize", remeasure);

    return () => {
      delete window.lumeStates;
      window.removeEventListener(measureEvent, remeasure);
      window.removeEventListener("resize", remeasure);
    };
  }, [measure]);

  const drift = Array.from(results.values()).reduce(
    (count, result) =>
      count +
      result.parts.reduce(
        (partCount, part) =>
          partCount + (part.missing ? 1 : part.checks.filter((check) => !check.matches).length),
        0,
      ),
    0,
  );

  return (
    <MeasurementsContext.Provider value={results}>
      <main className="flex min-h-screen flex-col gap-16 bg-page p-12 text-primary">
        <header className="flex items-baseline gap-4">
          <h1 className="text-display font-semibold">States</h1>
          <p className="text-meta text-secondary">
            Development only. {drift} values differ from Paper. Hover and focus specimens show their
            forced state only while scripts/sandbox/measure.ts runs.
          </p>
          <button
            className="ml-auto h-8 rounded-md bg-control px-3 text-body font-medium text-primary hover:bg-control-hover"
            onClick={() => measure()}
            type="button"
          >
            Measure again
          </button>
        </header>
        <TrackRowSection />
        <ButtonSection />
        <FieldSection />
        <SwitchSection />
        <NavRowSection />
        <RoughDataSection />
      </main>
    </MeasurementsContext.Provider>
  );
}
