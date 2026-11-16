import { HourglassIcon, MusicNoteIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PlayingMeter } from "@/components/playing-meter";
import type { PlaybackPhase } from "@/lib/playback-phase";
import { cn } from "@/lib/utils";

export function TrackArtwork({
  artworkUrl,
  className,
  phase,
}: {
  artworkUrl: string | null;
  className?: string;
  phase?: PlaybackPhase;
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
      <MusicNoteIcon aria-hidden="true" className="size-[43.75%] text-faint" />
      {artworkUrl && artworkUrl !== failedArtworkUrl && (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedArtworkUrl(artworkUrl)}
          src={artworkUrl}
        />
      )}
      {phase && <PhaseOverlay phase={phase} />}
    </span>
  );
}

function PhaseOverlay({ phase }: { phase: PlaybackPhase }) {
  const overlay = phaseOverlay(phase);

  if (!overlay) return null;

  return (
    <span
      aria-label={overlay.label}
      className="absolute inset-0 grid place-items-center bg-scrim"
      data-phase={phase.kind}
      data-slot="artwork-state"
      role="img"
    >
      {overlay.icon}
    </span>
  );
}

function phaseOverlay(phase: PlaybackPhase) {
  switch (phase.kind) {
    case "stopped":
      return null;
    case "loading":
      return {
        label: "Loading",
        icon: <HourglassIcon aria-hidden="true" className="size-3.5 text-primary" weight="bold" />,
      };
    case "playing":
      return { label: "Playing", icon: <PlayingMeter playing /> };
    case "paused":
      return { label: "Paused", icon: <PlayingMeter playing={false} /> };
    case "failed":
      return {
        label: "Couldn’t play",
        icon: (
          <WarningCircleIcon aria-hidden="true" className="size-3.5 text-danger" weight="fill" />
        ),
      };
  }
}
