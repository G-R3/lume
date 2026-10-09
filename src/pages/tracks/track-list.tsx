import {
  DotsThreeIcon,
  HeartIcon,
  ListPlusIcon,
  PlaylistIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";
import { usePlayback } from "@/hooks/use-playback";
import { collectionSource } from "@/lib/queue/source";
import type { Track } from "../../../shared/lib";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { formatAddedDate } from "@/lib/format-added-date";
import { formatDuration } from "@/lib/format-duration";
import { useCreatePlaylistFromTrackMutation, useSetTrackLiked } from "@/lib/library-query";
import { cn } from "@/lib/utils";

export type TrackListItem = {
  sourceEntryId: number;
  track: Track;
};

type TrackListProps = {
  caption: string;
  items: readonly TrackListItem[];
  playlistId?: number;
  renderMenuItems?: (item: TrackListItem) => ReactNode;
};

export function TrackList({ caption, items, playlistId, renderMenuItems }: TrackListProps) {
  const playback = usePlayback();
  const navigate = useNavigate();
  const createPlaylistFromTrack = useCreatePlaylistFromTrackMutation();
  const setTrackLiked = useSetTrackLiked();
  const addDialogTriggerRef = useRef<HTMLElement | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const isPlaylist = playlistId !== undefined;

  const handleAddToPlaylist = (track: Track, trigger: HTMLButtonElement) => {
    addDialogTriggerRef.current = trigger;
    setTrackToAdd(track);
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

  const handleSetTrackLiked = (track: Track) => {
    setTrackLiked.mutate(
      { liked: track.likedAt === null, trackId: track.id },
      {
        onError: (error) => {
          toast.add({
            description: error.message,
            priority: "high",
            title: "Could not update like",
            type: "error",
          });
        },
      },
    );
  };

  const playItem = (item: TrackListItem) => {
    if (!item.track.available) return;

    void playback.playSourceEntry({
      source: collectionSource(playlistId),
      sourceEntryId: item.sourceEntryId,
    });
  };

  const focusRow = (index: number) => {
    const item = items[Math.max(0, Math.min(items.length - 1, index))];

    if (!item) return;

    setSelectedEntryId(item.sourceEntryId);
    tableRef.current
      ?.querySelector<HTMLElement>(`tr[data-entry-id="${item.sourceEntryId}"]`)
      ?.focus();
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.target !== event.currentTarget) return;

    const pageSize = Math.max(
      1,
      Math.floor(
        (tableRef.current?.closest('[data-slot="sidebar-inset"]')?.clientHeight ??
          window.innerHeight) / 40,
      ) - 1,
    );

    const target = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      End: items.length - 1,
      Home: 0,
      PageDown: index + pageSize,
      PageUp: index - pageSize,
    }[event.key];

    if (target !== undefined) {
      event.preventDefault();
      focusRow(target);

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      playItem(items[index]);
    }
  };

  const tabStopEntryId = items.some((item) => item.sourceEntryId === selectedEntryId)
    ? selectedEntryId
    : items[0]?.sourceEntryId;

  return (
    <div className="@container" id="tracks">
      <table
        className="w-full table-fixed border-separate border-spacing-0 px-2"
        onPointerOver={showTruncatedText}
        ref={tableRef}
        role="grid"
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left font-mono text-meta tracking-[0.08em] text-secondary uppercase">
          <tr>
            {isPlaylist && (
              <th className="h-8 w-10 border-b border-separator pl-4 font-normal" scope="col">
                #
              </th>
            )}
            <th className="h-8 border-b border-separator pl-14 font-normal" scope="col">
              Title
            </th>
            <th
              className="hidden h-8 w-[30%] border-b border-separator pl-4 font-normal @3xl:table-cell @6xl:w-100"
              scope="col"
            >
              Album
            </th>
            <th
              className="hidden h-8 w-28 border-b border-separator pl-4 font-normal @3xl:table-cell"
              scope="col"
            >
              Added
            </th>
            <th className="h-8 w-8 border-b border-separator font-normal" scope="col">
              <span className="sr-only">Like</span>
            </th>
            <th
              className="h-8 w-22 border-b border-separator pr-4 pl-4 text-right font-normal"
              scope="col"
            >
              Time
            </th>
          </tr>
        </thead>
        <tbody className="before:table-row before:h-1">
          {items.map((item, index) => {
            const track = item.track;

            const isActive =
              playback.activeSourceEntryId === item.sourceEntryId &&
              playback.activeSourcePlaylistId === (playlistId ?? null);

            const isSelected = item.sourceEntryId === selectedEntryId;
            const isTabStop = item.sourceEntryId === tabStopEntryId;
            const metadataColor = track.available ? "text-secondary" : "text-disabled";

            return (
              <tr
                aria-current={isActive ? "true" : undefined}
                aria-selected={isSelected}
                className={cn(
                  "group/track-row cursor-default rounded-md focus-visible:-outline-offset-2 *:h-10 *:first:rounded-l-md *:last:rounded-r-md",
                  isSelected
                    ? "*:bg-selected"
                    : isActive
                      ? "*:bg-accent-subtle"
                      : "hover:*:bg-hover",
                )}
                data-entry-id={item.sourceEntryId}
                key={item.sourceEntryId}
                onClick={() => setSelectedEntryId(item.sourceEntryId)}
                onDoubleClick={() => playItem(item)}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                tabIndex={isTabStop ? 0 : -1}
              >
                {isPlaylist && (
                  <td className="pl-4 font-mono text-meta text-tertiary tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                )}
                <td className="pl-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <TrackArtwork
                      artworkUrl={track.artworkUrl}
                      className={cn("size-8", !track.available && "opacity-disabled")}
                      state={
                        isActive
                          ? playback.isPlaying
                            ? "playing"
                            : "paused"
                          : isSelected
                            ? "selected"
                            : undefined
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-left text-body font-medium",
                          track.available ? "text-primary" : "text-disabled",
                        )}
                        data-truncate
                        dir="auto"
                      >
                        {track.title}
                      </p>
                      <p
                        className={cn("truncate text-left text-meta", metadataColor)}
                        data-truncate
                        dir="auto"
                      >
                        {track.artists.join(", ") || "Unknown artist"}
                      </p>
                    </div>
                    {!track.available && (
                      <span className="shrink-0 text-meta text-secondary">Unavailable</span>
                    )}
                    <div
                      className="contents"
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <TrackRowMenu
                        canAddToQueue={playback.queue !== null}
                        isCreatingPlaylist={createPlaylistFromTrack.isPending}
                        onAddToQueue={() => playback.enqueueTrack(track.id)}
                        onAddToPlaylist={handleAddToPlaylist}
                        onCreatePlaylist={handleCreatePlaylist}
                        tabIndex={isTabStop ? 0 : -1}
                        track={track}
                      >
                        {renderMenuItems?.(item)}
                      </TrackRowMenu>
                    </div>
                  </div>
                </td>
                <td className={cn("hidden pl-4 @3xl:table-cell", metadataColor)}>
                  <p className="truncate text-left text-body" data-truncate dir="auto">
                    {track.album || "Unknown album"}
                  </p>
                </td>
                <td className={cn("hidden truncate pl-4 text-meta @3xl:table-cell", metadataColor)}>
                  {formatAddedDate(track.addedAt)}
                </td>
                <td
                  className="pl-4"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <Button
                    aria-label={
                      track.likedAt === null ? `Like ${track.title}` : `Unlike ${track.title}`
                    }
                    aria-pressed={track.likedAt !== null}
                    className={cn(
                      "-m-1",
                      track.likedAt === null &&
                        "opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100",
                    )}
                    onClick={() => handleSetTrackLiked(track)}
                    onPointerDown={(event) => event.preventDefault()}
                    size="icon-sm"
                    static
                    tabIndex={isTabStop ? 0 : -1}
                    type="button"
                    variant="ghost"
                  >
                    <HeartIcon
                      aria-hidden="true"
                      weight={track.likedAt === null ? "regular" : "fill"}
                    />
                  </Button>
                </td>
                <td
                  className={cn(
                    "pr-4 pl-4 text-right font-mono text-meta tabular-nums",
                    metadataColor,
                  )}
                >
                  {formatDuration(track.duration)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {trackToAdd && (
        <AddToPlaylistDialog
          finalFocus={addDialogTriggerRef}
          onCreatePlaylist={handleCreatePlaylist}
          onOpenChange={setAddDialogOpen}
          open={addDialogOpen}
          track={trackToAdd}
        />
      )}
    </div>
  );
}

// Long cells truncate; hovering one shows its full text, measured only when the pointer arrives.
function showTruncatedText(event: PointerEvent<HTMLTableElement>) {
  if (!(event.target instanceof Element)) return;

  const cell = event.target.closest<HTMLElement>("[data-truncate]");

  if (!cell) return;

  if (cell.scrollWidth > cell.clientWidth) cell.title = cell.textContent ?? "";
  else cell.removeAttribute("title");
}

function TrackRowMenu({
  canAddToQueue,
  children,
  isCreatingPlaylist,
  onAddToQueue,
  onAddToPlaylist,
  onCreatePlaylist,
  tabIndex,
  track,
}: {
  canAddToQueue: boolean;
  children?: ReactNode;
  isCreatingPlaylist: boolean;
  onAddToQueue: () => void;
  onAddToPlaylist: (track: Track, trigger: HTMLButtonElement) => void;
  onCreatePlaylist: (track: Track) => void;
  tabIndex: number;
  track: Track;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`More options for ${track.title}`}
            className="opacity-0 group-hover/track-row:opacity-100 group-focus-visible/track-row:opacity-100 group-has-focus-visible/track-row:opacity-100 data-popup-open:opacity-100"
            onMouseDown={(event) => event.preventDefault()}
            ref={triggerRef}
            size="icon-sm"
            static
            tabIndex={tabIndex}
            variant="ghost"
          />
        }
      >
        <DotsThreeIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canAddToQueue && (
          <>
            <DropdownMenuItem onClick={onAddToQueue}>
              <ListPlusIcon aria-hidden="true" />
              Add to queue
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            if (triggerRef.current) onAddToPlaylist(track, triggerRef.current);
          }}
        >
          <PlaylistIcon aria-hidden="true" />
          Add to playlist…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isCreatingPlaylist} onClick={() => onCreatePlaylist(track)}>
          <PlusIcon aria-hidden="true" />
          New playlist from track
        </DropdownMenuItem>
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
