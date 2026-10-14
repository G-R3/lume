import { cn } from "@/lib/utils";

const gradients = [
  "linear-gradient(in oklab 140deg, oklab(26% 0.03 -0.09) 0%, oklab(42% 0.06 -0.12) 55%, oklab(70% 0.05 0.1) 100%)",
  "linear-gradient(in oklab 140deg, oklab(30% -0.02 -0.04) 0%, oklab(52% -0.04 -0.03) 55%, oklab(76% -0.02 0.02) 100%)",
  "linear-gradient(in oklab 140deg, oklab(50% 0.08 0.02) 0%, oklab(78% 0.06 0.06) 100%)",
  "linear-gradient(in oklab 140deg, oklab(40% -0.03 0.02) 0%, oklab(70% -0.05 0.04) 100%)",
  "linear-gradient(in oklab 140deg, oklab(60% 0.03 0.08) 0%, oklab(86% 0.01 0.06) 100%)",
  "linear-gradient(in oklab 140deg, oklab(45% 0.1 0.04) 0%, oklab(70% 0.12 0.07) 100%)",
  "linear-gradient(in oklab 140deg, oklab(32.9% -0.039 -0.033) 0%, oklab(67.2% -0.064 -0.026) 100%)",
];

export function PlaylistCover({
  className,
  playlist,
  showInitials = false,
}: {
  className?: string;
  playlist: { id: number; title: string };
  showInitials?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-end rounded-sm outline -outline-offset-1 outline-image",
        className,
      )}
      data-slot="playlist-cover"
      style={{ backgroundImage: gradients[playlist.id % gradients.length] }}
    >
      {showInitials && (
        <span className="font-mono text-meta font-bold tracking-[0.04em] text-primary">
          {getInitials(playlist.title)}
        </span>
      )}
    </span>
  );
}

function getInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
}
