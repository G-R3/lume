import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const glyphColumns = [
  1, 2, 3, 3, 3, 2, 2, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 3, 2, 2, 2, 2, 2, 1,
  2, 2, 3, 3, 3, 2, 1,
];

const glyphRows = [[], [10], [8, 13], [5, 10, 15]];

function hash(column: number, y: number, salt: number) {
  const value = Math.sin(column * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;

  return value - Math.floor(value);
}

function twinkle(
  column: number,
  y: number,
): CSSProperties & {
  "--twinkle-duration": string;
  "--twinkle-delay": string;
  "--twinkle-low": number;
} {
  return {
    "--twinkle-duration": `${900 + hash(column, y, 1) * 1500}ms`,
    "--twinkle-delay": `${-hash(column, y, 2) * 2400}ms`,
    "--twinkle-low": 0.1 + hash(column, y, 3) * 0.3,
  };
}

function ScanGlyph({ busy }: { busy: boolean }) {
  return (
    <div className="relative shrink-0" data-slot="scan-glyph">
      <GlyphDots className="fill-track" />
      <GlyphDots
        className={cn(
          "absolute inset-0 fill-accent transition-opacity ease-[ease]",
          busy ? "opacity-100 duration-250" : "opacity-0 duration-200",
        )}
        shimmer={busy ? "running" : "paused"}
      />
    </div>
  );
}

function GlyphDots({ className, shimmer }: { className: string; shimmer?: "paused" | "running" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-slot={shimmer ? "scan-glyph-shimmer" : undefined}
      height="24"
      viewBox="0 0 198 24"
      width="198"
    >
      {glyphColumns.flatMap((dots, column) =>
        (glyphRows[dots] ?? []).map((y) => (
          <rect
            className={cn(
              shimmer && "motion-safe:animate-glyph-twinkle",
              shimmer === "paused" && "motion-safe:[animation-play-state:paused]",
            )}
            height="3"
            key={`${column}-${y}`}
            rx="1"
            style={shimmer ? twinkle(column, y) : undefined}
            width="3"
            x={column * 5}
            y={y}
          />
        )),
      )}
    </svg>
  );
}

export function LibraryOnboarding({
  actions,
  busy = false,
  description,
  errorMessage,
  title,
}: {
  actions: ReactNode;
  busy?: boolean;
  description: string;
  errorMessage?: string | null;
  title: string;
}) {
  return (
    <div className="flex w-100 max-w-full flex-col items-start" data-slot="library-onboarding">
      <ScanGlyph busy={busy} />
      <div className="flex flex-col gap-2 pt-8" data-onboarding-part>
        <h1 className="text-display font-semibold text-primary">{title}</h1>
        <p className="text-copy text-secondary">{description}</p>
      </div>
      <div className="flex items-center gap-2 pt-6" data-onboarding-part>
        {actions}
      </div>
      {errorMessage && (
        <p className="flex gap-2 pt-4 text-meta text-danger" data-onboarding-part role="alert">
          <span aria-hidden="true" className="mt-1.25 size-1.5 shrink-0 rounded-full bg-danger" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export function FirstRunScreen({
  errorMessage,
  isLoading,
  isMac,
  onAddSource,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  isMac: boolean;
  onAddSource: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-page text-primary">
      <div className={cn("h-12 shrink-0", isMac && "[-webkit-app-region:drag]")} />
      <div className="flex flex-1 justify-center px-6 pt-54">
        <LibraryOnboarding
          actions={
            <Button busy={isLoading} onClick={onAddSource} type="button" variant="primary">
              Choose folder…
            </Button>
          }
          busy={isLoading}
          description="Choose a folder of audio files. Lume plays them where they are."
          errorMessage={errorMessage}
          title="Add your music"
        />
      </div>
    </main>
  );
}
