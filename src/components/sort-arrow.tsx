import type { SortDirection } from "@/lib/track-sort";
import { cn } from "@/lib/utils";

// Phosphor's CaretUpDown split into halves, so each half takes its own color.
export function SortArrow({ direction }: { direction: SortDirection | null }) {
  return (
    <svg aria-hidden="true" className="size-3 shrink-0" viewBox="0 0 256 256">
      <path
        className={cn(
          direction === null
            ? "text-tertiary group-hover/sort:text-secondary group-focus-visible/sort:text-secondary"
            : direction === "asc"
              ? "text-primary"
              : "text-tertiary",
        )}
        d="M85.66,85.66L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z"
        fill="currentColor"
      />
      <path
        className={cn(
          direction === null
            ? "text-tertiary group-hover/sort:text-secondary group-focus-visible/sort:text-secondary"
            : direction === "desc"
              ? "text-primary"
              : "text-tertiary",
        )}
        d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Z"
        fill="currentColor"
      />
    </svg>
  );
}
