import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const columns = [
  { cycle: "0.9s", delay: "0s", still: 2 },
  { cycle: "1.1s", delay: "-0.45s", still: 4 },
  { cycle: "1.3s", delay: "-0.9s", still: 1 },
  { cycle: "1s", delay: "-0.3s", still: 3 },
];

const upperRows = [4, 3, 2];

export function PlayingMeter({ playing }: { playing: boolean }) {
  const hidden = useSyncExternalStore(
    subscribeToVisibility,
    () => document.hidden,
    () => false,
  );

  return (
    <span aria-hidden="true" className="relative grid size-3.5 grid-cols-4 grid-rows-4 gap-0.5">
      {Array.from({ length: 16 }, (_, index) => (
        <span className="rounded-[0.5px] bg-meter-off" key={index} />
      ))}
      <span
        className={cn(
          "absolute inset-x-0 top-0 grid h-2.5 grid-cols-4 gap-0.5 overflow-hidden transition-opacity duration-150 ease-out",
          !playing && "opacity-0",
        )}
      >
        {columns.map((column, index) => (
          <span
            className="flex flex-col gap-0.5 motion-safe:animate-meter-column"
            key={index}
            style={{
              animationDelay: column.delay,
              animationDuration: column.cycle,
              animationPlayState: playing && !hidden ? "running" : "paused",
              transform: `translateY(${(4 - column.still) * 4}px)`,
            }}
          >
            {upperRows.map((row) => (
              <span className="size-0.5 rounded-[0.5px] bg-accent" key={row} />
            ))}
          </span>
        ))}
      </span>
      <span className="absolute inset-x-0 bottom-0 grid grid-cols-4 gap-0.5">
        {columns.map((_, index) => (
          <span className="size-0.5 rounded-[0.5px] bg-accent" key={index} />
        ))}
      </span>
    </span>
  );
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);

  return () => document.removeEventListener("visibilitychange", onChange);
}
