import { CheckIcon, MusicNoteIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PlayingMeter } from "@/components/playing-meter";
import { cn } from "@/lib/utils";

export type ArtworkState = "paused" | "playing" | "selected";

export function TrackArtwork({
  artworkUrl,
  className,
  state,
}: {
  artworkUrl: string | null;
  className?: string;
  state?: ArtworkState;
}) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-sm bg-raised outline -outline-offset-1 outline-image",
        className,
      )}
      data-slot="track-artwork"
    >
      <MusicNoteIcon aria-hidden="true" className="size-[43.75%] text-disabled" />
      {artworkUrl && artworkUrl !== failedArtworkUrl && (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedArtworkUrl(artworkUrl)}
          src={artworkUrl}
        />
      )}
      {state && (
        <span
          aria-hidden={state === "selected" || undefined}
          aria-label={state === "selected" ? undefined : state === "playing" ? "Playing" : "Paused"}
          className="absolute inset-0 grid place-items-center bg-scrim"
          data-slot="artwork-state"
          role={state === "selected" ? undefined : "img"}
        >
          {state === "selected" ? (
            <CheckIcon className="size-3.5 text-primary" weight="bold" />
          ) : (
            <PlayingMeter playing={state === "playing"} />
          )}
        </span>
      )}
    </span>
  );
}
