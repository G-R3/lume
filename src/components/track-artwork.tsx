import type { Track } from "../../shared/lib";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export function TrackArtwork({
  artworkUrl,
  className,
  fallback,
}: {
  artworkUrl: string | null;
  className?: string;
  fallback: ReactNode;
}) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={cn("relative grid shrink-0 overflow-hidden rounded-[3px]", className)}
    >
      {fallback}
      {artworkUrl && artworkUrl !== failedArtworkUrl && (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedArtworkUrl(artworkUrl)}
          src={artworkUrl}
        />
      )}
    </span>
  );
}

const coverClasses = [
  "from-orange-950 to-orange-500",
  "from-cyan-950 to-cyan-500",
  "from-purple-950 to-purple-500",
  "from-emerald-950 to-emerald-500",
  "from-stone-800 to-stone-500",
  "from-indigo-950 to-indigo-500",
];

export function ArtworkFallback({
  track,
}: {
  track: Pick<Track, "album" | "albumArtists" | "id" | "title">;
}) {
  return (
    <span
      className={cn(
        "font-berkeley absolute inset-0 grid place-items-center bg-linear-to-br font-semibold tracking-[-0.04em] text-neutral-100",
        getCoverClass(track),
      )}
    >
      {track.title
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

function getCoverClass(track: Pick<Track, "album" | "albumArtists" | "id">) {
  const colorKey =
    track.album === "Unknown album" ? track.id : `${track.albumArtists.join(",")}:${track.album}`;

  const hash = Array.from(colorKey).reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0,
    0,
  );

  return coverClasses[hash % coverClasses.length];
}
