import { PlayIcon, ShuffleAngularIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { usePlayback } from "@/hooks/use-playback";
import { formatDuration } from "@/lib/format-duration";
import { collectionSource } from "@/lib/queue/source";
import { cn } from "@/lib/utils";
import type { TrackListItem } from "@/pages/tracks/track-list";

type TrackCollectionHeaderProps = {
  artwork?: ReactNode;
  artworkClassName?: string;
  description?: string | null;
  eyebrow?: string;
  items: readonly TrackListItem[];
  playlistId?: number;
  title: string;
  trackCount?: number;
};

export function TrackCollectionHeader({
  artwork,
  artworkClassName,
  description,
  eyebrow,
  items,
  playlistId,
  title,
  trackCount = items.length,
}: TrackCollectionHeaderProps) {
  const playback = usePlayback();

  const source = collectionSource(playlistId);

  const hasAvailableTracks = items.some((item) => item.track.available);
  const totalDuration = items.reduce((duration, item) => duration + (item.track.duration ?? 0), 0);

  return (
    <header className="flex flex-wrap items-end gap-6 px-5 py-6 max-sm:flex-col max-sm:items-start">
      <div
        aria-hidden="true"
        className={cn(
          "grid size-40 shrink-0 place-items-center rounded-lg bg-raised outline-1 -outline-offset-1 outline-image max-sm:aspect-video max-sm:h-auto max-sm:w-full sm:size-52 lg:size-64",
          artworkClassName,
        )}
      >
        {artwork}
      </div>

      <div className="min-w-0 pb-0.5 sm:flex-1 sm:basis-56">
        {eyebrow && (
          <p className="font-mono mb-2 text-[10px] tracking-[0.12em] text-secondary uppercase">
            {eyebrow}
          </p>
        )}
        <div className="space-y-2">
          <h1 className="truncate text-4xl font-semibold tracking-[-0.04em] text-primary">
            {title}
          </h1>
          {description && <p className="truncate text-xs text-secondary">{description}</p>}
          <p className="flex items-center gap-2 text-xs text-secondary">
            <span>
              {trackCount} {trackCount === 1 ? "track" : "tracks"}
            </span>
            <span aria-hidden="true" className="text-disabled">
              &bull;
            </span>
            <span>{formatDuration(totalDuration)}</span>
          </p>
        </div>

        <div aria-label="Playback actions" className="mt-5 flex flex-wrap gap-2" role="group">
          <Button
            disabled={!playback.isInitialized || !hasAvailableTracks}
            onClick={() => void playback.playSource(source)}
            type="button"
            variant="primary"
          >
            <PlayIcon aria-hidden="true" data-icon="inline-start" weight="fill" />
            Play
          </Button>
          <Button
            disabled={!playback.isInitialized || !hasAvailableTracks}
            onClick={() => void playback.shufflePlay(source)}
            type="button"
          >
            <ShuffleAngularIcon aria-hidden="true" data-icon="inline-start" />
            Shuffle play
          </Button>
        </div>
      </div>
    </header>
  );
}
