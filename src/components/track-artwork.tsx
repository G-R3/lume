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
  "from-[oklch(26.6%_0.079_36.259)] to-[oklch(70.5%_0.213_47.604)]",
  "from-[oklch(30.2%_0.056_229.695)] to-[oklch(71.5%_0.143_215.221)]",
  "from-[oklch(29.1%_0.149_302.717)] to-[oklch(62.7%_0.265_303.9)]",
  "from-[oklch(26.2%_0.051_172.552)] to-[oklch(69.6%_0.17_162.48)]",
  "from-[oklch(26.8%_0.007_34.298)] to-[oklch(55.3%_0.013_58.071)]",
  "from-[oklch(25.7%_0.09_281.288)] to-[oklch(58.5%_0.233_277.117)]",
];

export function ArtworkFallback({
  track,
}: {
  track: Pick<Track, "album" | "albumArtists" | "id" | "title">;
}) {
  return (
    <span
      className={cn(
        "font-mono absolute inset-0 grid place-items-center bg-linear-to-br font-semibold tracking-[-0.04em] text-primary",
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

  const hash = Array.from(String(colorKey)).reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0,
    0,
  );

  return coverClasses[hash % coverClasses.length];
}
