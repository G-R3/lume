import { DotsThreeIcon, LockSimpleIcon, PlaylistIcon, PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import type { Track } from "../../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { ArtworkFallback, TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/format-duration";
import { useCreatePlaylistFromTrackMutation } from "@/lib/library-query";
import { cn } from "@/lib/utils";

type TrackListItem = {
  key: number;
  track: Track;
};

type TrackListProps = {
  caption: string;
  items: readonly TrackListItem[];
  playlistId?: number;
  renderMenuItems?: (item: TrackListItem) => ReactNode;
};

export function TrackList({ caption, items, playlistId, renderMenuItems }: TrackListProps) {
  const audioPlayer = useAudioPlayer();
  const navigate = useNavigate();
  const createPlaylistFromTrack = useCreatePlaylistFromTrackMutation();
  const addDialogTriggerRef = useRef<HTMLElement | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const handleAddToPlaylist = (track: Track, trigger: HTMLButtonElement) => {
    addDialogTriggerRef.current = trigger;
    setSelectedTrack(track);
    setAddDialogOpen(true);
  };

  const handleCreatePlaylist = (track: Track) => {
    createPlaylistFromTrack.mutate(track.id, {
      onError: (error) => {
        toast.add({
          description: error.message,
          priority: "high",
          title: "Could not create playlist",
          type: "error",
        });
      },
      onSuccess: (playlist) => {
        void navigate({
          params: { playlistId: playlist.id },
          to: "/playlists/$playlistId",
        });
      },
    });
  };

  return (
    <div id="tracks">
      <table className="w-full table-fixed text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="font-berkeley border-b border-neutral-800 text-left tracking-[0.08em] text-neutral-400 uppercase">
          <tr>
            <th className="hidden w-14 py-2.5 pr-3 pl-5 font-normal sm:table-cell" scope="col">
              #
            </th>
            <th className="pl-1 pr-2 py-2.5 font-normal" scope="col">
              Title
            </th>
            <th className="hidden w-[30%] px-3 py-2.5 font-normal lg:table-cell" scope="col">
              Album
            </th>
            <th className="w-18 px-2 py-2.5 text-right font-normal sm:w-24 sm:px-3" scope="col">
              Duration
            </th>
            <th className="w-10 py-2.5 pr-3 pl-1 font-normal sm:w-12 sm:pr-5 sm:pl-2" scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const track = item.track;
            const isActive = audioPlayer.activeQueueKey === item.key;
            const metadataColor = track.available ? "text-neutral-400" : "text-neutral-700";
            const artists = track.artists.join(", ") || "Unknown artist";
            const album = track.album || "Unknown album";

            return (
              <tr
                className={cn(
                  "group/track-row border-b border-l-2 border-neutral-900",
                  isActive
                    ? "border-l-lime-300 bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                    : "border-l-transparent",
                  track.available
                    ? "cursor-pointer hover:bg-neutral-950 focus-within:bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                    : "bg-neutral-950/40",
                )}
                key={item.key}
                onClick={
                  track.available ? () => audioPlayer.playFrom(items, index, playlistId) : undefined
                }
              >
                <td
                  className={cn(
                    "font-berkeley hidden h-12 pr-3 pl-5 tabular-nums sm:table-cell",
                    metadataColor,
                  )}
                >
                  {isActive && audioPlayer.isPlaying ? (
                    <span aria-label="Playing" className="flex h-3 items-end gap-0.5">
                      <i className="h-1 w-0.5 bg-lime-300" />
                      <i className="h-2.5 w-0.5 bg-lime-300" />
                      <i className="h-1.5 w-0.5 bg-lime-300" />
                    </span>
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </td>
                <td className="h-12 min-w-0 pl-1 pr-2">
                  <button
                    aria-current={isActive ? "true" : undefined}
                    aria-label={track.title}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2.5 text-left outline-none",
                      track.available ? "cursor-pointer" : "cursor-not-allowed",
                    )}
                    disabled={!track.available}
                    type="button"
                  >
                    <TrackArtwork
                      artworkUrl={track.artworkUrl}
                      className={cn(
                        "size-8 text-[8px]",
                        !track.available && "grayscale opacity-40",
                      )}
                      fallback={<ArtworkFallback track={track} />}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate",
                          track.available ? "text-neutral-100" : "text-neutral-500",
                        )}
                      >
                        {track.title}
                      </span>
                      <span className={cn("block truncate leading-4", metadataColor)}>
                        <span>{artists}</span>
                        <span className="lg:hidden"> · {album}</span>
                      </span>
                    </span>
                    {!track.available && (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-neutral-600">
                        <LockSimpleIcon aria-hidden="true" />
                        <span className="hidden sm:inline">Unavailable</span>
                      </span>
                    )}
                  </button>
                </td>
                <td className={cn("hidden h-12 px-3 lg:table-cell", metadataColor)}>
                  <div className="truncate">{album}</div>
                </td>
                <td
                  className={cn(
                    "font-berkeley h-12 px-2 text-right tabular-nums sm:px-3",
                    metadataColor,
                  )}
                >
                  {formatDuration(track.duration)}
                </td>
                <td
                  className="h-12 py-1 pr-3 pl-1 text-right sm:pr-5 sm:pl-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <TrackRowMenu
                    isCreatingPlaylist={createPlaylistFromTrack.isPending}
                    onAddToPlaylist={handleAddToPlaylist}
                    onCreatePlaylist={handleCreatePlaylist}
                    track={track}
                  >
                    {renderMenuItems?.(item)}
                  </TrackRowMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedTrack && (
        <AddToPlaylistDialog
          finalFocus={addDialogTriggerRef}
          onOpenChange={setAddDialogOpen}
          open={addDialogOpen}
          track={selectedTrack}
        />
      )}
    </div>
  );
}

function TrackRowMenu({
  children,
  isCreatingPlaylist,
  onAddToPlaylist,
  onCreatePlaylist,
  track,
}: {
  children?: ReactNode;
  isCreatingPlaylist: boolean;
  onAddToPlaylist: (track: Track, trigger: HTMLButtonElement) => void;
  onCreatePlaylist: (track: Track) => void;
  track: Track;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`More options for ${track.title}`}
            className="text-neutral-500 opacity-0 group-focus-within/track-row:opacity-100 group-hover/track-row:opacity-100 data-popup-open:opacity-100 hover:text-neutral-100"
            ref={triggerRef}
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <DotsThreeIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" finalFocus={false}>
        <DropdownMenuItem disabled={isCreatingPlaylist} onClick={() => onCreatePlaylist(track)}>
          <PlusIcon aria-hidden="true" />
          New playlist
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (triggerRef.current) onAddToPlaylist(track, triggerRef.current);
          }}
        >
          <PlaylistIcon aria-hidden="true" />
          Add to playlist
        </DropdownMenuItem>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
