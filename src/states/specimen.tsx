import { type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { type PartSpec, type SpecimenResult, specimenParts } from "@/states/measure";
import { MeasurementsContext } from "@/states/measurements-context";

/** Pseudo-classes the measure script forces through the DevTools protocol before measuring. */
export type ForcedState = "focus-visible" | "focus-within" | "hover";

export function Section({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline gap-3 pb-2">
        <h2 className="text-title font-semibold text-primary">{title}</h2>
        <p className="text-meta text-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function Specimen({
  children,
  force,
  id,
  label,
  note,
  parts,
}: {
  children?: ReactNode;
  /** Forces pseudo-classes on the element the selector matches, inside the specimen. */
  force?: { selector: string; states: readonly ForcedState[] };
  id: string;
  label: string;
  /** Explains a state the app does not have yet. The Paper values are still listed. */
  note?: string;
  parts: readonly PartSpec[];
}) {
  specimenParts.set(id, parts);

  const result = useContext(MeasurementsContext).get(id);

  return (
    <div
      className="grid grid-cols-[144px_minmax(0,1fr)] gap-x-4 gap-y-2"
      data-force-selector={force?.selector}
      data-force-states={force?.states.join(" ")}
      data-specimen={id}
    >
      <div className="pt-3 text-meta text-secondary">
        {label}
        {force && <span className="block text-tertiary">forced :{force.states.join(", :")}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {note ? (
          <p className="flex h-10 items-center rounded-md border border-dashed border-strong px-4 text-meta text-secondary">
            {note}
          </p>
        ) : (
          <div data-specimen-content>{children}</div>
        )}
        <SpecimenMetrics note={note} result={result} />
      </div>
    </div>
  );
}

function SpecimenMetrics({ note, result }: { note?: string; result?: SpecimenResult }) {
  if (!result) return <p className="text-meta text-tertiary">Not measured yet</p>;

  const checks = result.parts.flatMap((part) =>
    part.missing
      ? [{ app: "missing", matches: false, paper: "", part: part.name, property: "element" }]
      : part.checks.map((check) => ({ ...check, part: part.name })),
  );

  const drift = checks.filter((check) => !check.matches);

  return (
    <details className="text-meta" open={drift.length > 0 && !note}>
      <summary className="cursor-pointer text-secondary">
        {drift.length === 0
          ? `All ${checks.length} values match Paper`
          : `${drift.length} of ${checks.length} values differ from Paper`}
      </summary>
      <table className="mt-1 font-mono tabular-nums">
        <thead className="text-secondary">
          <tr>
            <th className="pr-6 text-left font-normal">Part</th>
            <th className="pr-6 text-left font-normal">Property</th>
            <th className="pr-6 text-left font-normal">App</th>
            <th className="text-left font-normal">Paper</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr
              className={cn(check.matches ? "text-tertiary" : "text-primary")}
              key={`${check.part}.${check.property}`}
            >
              <td className="pr-6">
                {check.matches ? "  " : "≠ "}
                {check.part}
              </td>
              <td className="pr-6">{check.property}</td>
              <td className={cn("pr-6", !check.matches && "text-danger")}>{check.app}</td>
              <td>{check.paper}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
