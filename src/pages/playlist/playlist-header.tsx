import {
  DotsThreeVerticalIcon,
  PlayIcon,
  ShuffleAngularIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { PlaylistDetails } from "../../../shared/lib";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import { PlaylistCover } from "@/components/playlist-cover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayback } from "@/hooks/use-playback";
import { formatTotalDuration } from "@/lib/format-duration";
import { collectionSource } from "@/lib/queue/source";
import type { TrackListItem } from "@/pages/tracks/track-list";

export function PlaylistHeader({
  items,
  playlist,
}: {
  items: readonly TrackListItem[];
  playlist: PlaylistDetails;
}) {
  const playback = usePlayback();
  const source = collectionSource(playlist.id);
  const trackCount = playlist.tracks.length;
  const canPlay = playback.isInitialized && items.some((item) => item.track.available);
  const totalDuration = items.reduce((total, item) => total + (item.track.duration ?? 0), 0);

  return (
    <header className="flex h-22 shrink-0 items-center gap-4 pr-4 pl-6" data-slot="page-header">
      <PlaylistCover className="size-14 rounded-md p-1.5" playlist={playlist} showInitials />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h1 className="truncate text-display font-semibold text-primary">{playlist.title}</h1>
        {(playlist.description || trackCount > 0) && (
          <p className="col-start-1 row-start-2 flex items-baseline gap-2 text-secondary">
            {playlist.description && (
              <span className="truncate text-body" title={playlist.description}>
                {playlist.description}
              </span>
            )}
            {trackCount > 0 && (
              <span className="shrink-0 text-meta tabular-nums">
                {trackCount.toLocaleString()} {trackCount === 1 ? "track" : "tracks"}
                {" · "}
                {formatTotalDuration(totalDuration)}
              </span>
            )}
          </p>
        )}
        {/* nudged down 3px to sit on the title's lowercase letters rather than its line box */}
        <div
          aria-label="Playback actions"
          className="col-start-2 row-start-1 flex translate-y-0.75 items-center gap-2"
          role="group"
        >
          <Button
            disabled={!canPlay}
            onClick={() => void playback.playSource(source)}
            type="button"
            variant="primary"
          >
            <PlayIcon
              aria-hidden="true"
              className="size-3.5"
              data-icon="inline-start"
              weight="fill"
            />
            Play
          </Button>
          {/* named apart from the player's shuffle toggle, which is also "Shuffle" */}
          <Button
            aria-label="Shuffle play"
            disabled={!canPlay}
            onClick={() => void playback.shufflePlay(source)}
            type="button"
          >
            <ShuffleAngularIcon aria-hidden="true" className="size-3.5" data-icon="inline-start" />
            Shuffle
          </Button>
          <PlaylistMenu playlist={playlist} />
        </div>
      </div>
    </header>
  );
}

function PlaylistMenu({ playlist }: { playlist: PlaylistDetails }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`More options for ${playlist.title}`}
              ref={menuTriggerRef}
              size="icon"
              variant="toolbar"
            />
          }
        >
          <DotsThreeVerticalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="danger">
            <TrashIcon aria-hidden="true" />
            Delete playlist…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeletePlaylistDialog
        finalFocus={menuTriggerRef}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        playlist={{ ...playlist, trackCount: playlist.tracks.length }}
      />
    </>
  );
}
