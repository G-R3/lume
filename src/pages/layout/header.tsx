import { DotsThreeIcon, TrashIcon } from "@phosphor-icons/react";
import { useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { PlaylistSummary } from "../../../shared/lib";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useLibraryMutation } from "@/lib/library-query";
import { cn } from "@/lib/utils";

export function AppHeader({ isSettings, queueOpen }: { isSettings: boolean; queueOpen: boolean }) {
  const library = useMusicLibrary();
  const libraryMutation = useLibraryMutation();
  const params = useParams({ strict: false });
  const sidebar = useSidebar();

  const playlist = params.playlistId
    ? library.playlists.find((playlist) => playlist.id === params.playlistId)
    : undefined;

  const unavailableTrackCount = library.tracks.filter((track) => !track.available).length;

  return (
    <>
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-4 px-4",
          window.lume.isMac && "[-webkit-app-region:drag] [&_button]:[-webkit-app-region:no-drag]",
        )}
      >
        {/* keeps the content clear of the traffic lights and the toggle, so nothing moves */}
        {(sidebar.isMobile || sidebar.state === "collapsed") && (
          <div aria-hidden="true" className="w-52 shrink-0" />
        )}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {isSettings ? "Settings" : (playlist?.title ?? "All tracks")}
          </h1>
          {!isSettings && playlist && (
            <span className="font-mono shrink-0 rounded bg-selected px-1.5 py-1 text-[10px] text-secondary tabular-nums">
              {playlist.trackCount.toLocaleString()}{" "}
              {playlist.trackCount === 1 ? "track" : "tracks"}
            </span>
          )}
          {!isSettings && !playlist && (
            <span className="font-mono shrink-0 rounded bg-selected px-1.5 py-1 text-[10px] text-secondary tabular-nums">
              {library.tracks.length.toLocaleString()}
            </span>
          )}
          {!isSettings && !playlist && unavailableTrackCount > 0 && (
            <span className="font-mono shrink-0 rounded bg-selected px-1.5 py-1 text-[10px] text-secondary tabular-nums">
              {unavailableTrackCount.toLocaleString()} unavailable
            </span>
          )}
        </div>

        <div
          className={cn(
            "ml-auto mr-6 flex shrink-0 items-center gap-1 sm:mr-7",
            queueOpen && "md:-mr-2",
          )}
        >
          {playlist && <PlaylistHeaderMenu playlist={playlist} />}
        </div>
      </header>

      {libraryMutation.error && (
        <p className="m-4 text-sm text-danger" role="alert">
          {libraryMutation.error.message}
        </p>
      )}
    </>
  );
}

function PlaylistHeaderMenu({ playlist }: { playlist: PlaylistSummary }) {
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
          <DotsThreeIcon aria-hidden="true" />
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
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        playlist={playlist}
      />
    </>
  );
}
