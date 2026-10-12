import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-separator pt-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body font-semibold">{title}</h2>
        {note && <p className="text-meta text-tertiary">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body">{label}</span>
        {note && <span className="text-meta text-tertiary">{note}</span>}
      </div>
      <Switch aria-label={label} checked={checked} className="mt-0.5" onCheckedChange={onChange} />
    </label>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-meta">
        <span className="text-secondary">{label}</span>
        <span className="font-mono text-secondary tabular-nums">{format(value)}</span>
      </div>
      <Slider
        aria-label={label}
        max={max}
        min={min}
        onValueChange={onChange}
        step={step}
        value={value}
      />
    </div>
  );
}

export function Segmented<Value extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [Value, string])[];
  value: string;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      className="flex rounded-md bg-raised p-0.5 ring-1 ring-default ring-inset"
      role="radiogroup"
    >
      {options.map(([key, label]) => (
        <button
          aria-checked={value === key}
          className={cn(
            "h-7 flex-1 cursor-pointer rounded-sm px-2 text-meta text-secondary hover:text-primary",
            value === key && "bg-selected text-primary",
          )}
          key={key}
          onClick={() => onChange(key)}
          role="radio"
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
