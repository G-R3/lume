import {
  DotsThreeVerticalIcon,
  PlayIcon,
  ShuffleAngularIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useRef, useState } from "react";
import type { PlaylistDetails } from "../../../shared/lib";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayback } from "@/hooks/use-playback";
import { formatTotalDuration } from "@/lib/format-duration";
import { sessionSource } from "@/lib/queue/source";
import type { TrackListItem } from "@/pages/tracks/track-list";

export function PlaylistHeader({
  filter,
  filterField,
  items,
  playlist,
}: {
  filter: string | null;
  filterField: ReactNode;
  items: readonly TrackListItem[];
  playlist: PlaylistDetails;
}) {
  const playback = usePlayback();

  const source = { kind: "playlist", playlistId: playlist.id, title: playlist.title } as const;
  const trackCount = filter === null ? playlist.tracks.length : items.length;
  const showsCount = filter !== null || trackCount > 0;
  const canPlay = playback.isInitialized && items.some((item) => item.track.available);
  const totalDuration = items.reduce((total, item) => total + (item.track.duration ?? 0), 0);

  return (
    <header className="flex h-22 shrink-0 items-center gap-4 pr-4 pl-6" data-slot="page-header">
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h1 className="truncate text-display font-semibold text-primary">{playlist.title}</h1>
        {(playlist.description || showsCount) && (
          <p className="col-start-1 row-start-2 flex items-baseline gap-2 text-secondary">
            {playlist.description && (
              <span className="truncate text-body" title={playlist.description}>
                {playlist.description}
              </span>
            )}
            {showsCount && (
              <span className="shrink-0 text-meta tabular-nums">
                {trackCount.toLocaleString()} {trackCount === 1 ? "track" : "tracks"}
                {" · "}
                {formatTotalDuration(totalDuration)}
              </span>
            )}
          </p>
        )}
        <div className="col-start-2 row-start-1 flex translate-y-0.75 items-center gap-2">
          {filterField}
          <div aria-label="Playback actions" className="flex items-center gap-2" role="group">
            <Button
              disabled={!canPlay}
              onClick={() => playback.playSource(sessionSource(source, items, filter))}
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
            <Button
              aria-label="Shuffle play"
              disabled={!canPlay}
              onClick={() => playback.shufflePlay(sessionSource(source, items, filter))}
              type="button"
            >
              <ShuffleAngularIcon
                aria-hidden="true"
                className="size-3.5"
                data-icon="inline-start"
              />
              Shuffle
            </Button>
            <PlaylistMenu playlist={playlist} />
          </div>
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
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="danger">
            <TrashIcon aria-hidden="true" />
            Delete playlist…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeletePlaylistDialog
        finalFocus={menuTriggerRef}
        focusAfterDelete={() => document.querySelector<HTMLElement>("[data-slot=page-title]")}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        playlist={{ ...playlist, trackCount: playlist.tracks.length }}
      />
    </>
  );
}
