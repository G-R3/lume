import { DotsThreeIcon } from "@phosphor-icons/react";
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
          "flex shrink-0 items-center gap-2 px-5",
          window.lume.isMac
            ? "h-9 [-webkit-app-region:drag] [&_button]:[-webkit-app-region:no-drag]"
            : "h-12.5",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 pl-7.5 md:ml-1 md:pl-0 md:transition-transform md:duration-200 md:ease-linear motion-reduce:transition-none",
            window.lume.isMac && "pl-24 md:pl-0",
            sidebar.state === "collapsed" &&
              (window.lume.isMac ? "md:translate-x-23" : "md:translate-x-8"),
          )}
        >
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {isSettings ? "Settings" : (playlist?.title ?? "All tracks")}
          </h1>
          {!isSettings && playlist && (
            <span className="font-berkeley shrink-0 rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-400 tabular-nums">
              {playlist.trackCount.toLocaleString()}{" "}
              {playlist.trackCount === 1 ? "track" : "tracks"}
            </span>
          )}
          {!isSettings && !playlist && (
            <span className="font-berkeley shrink-0 rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-400 tabular-nums">
              {library.tracks.length.toLocaleString()}
            </span>
          )}
          {!isSettings && !playlist && unavailableTrackCount > 0 && (
            <span className="font-berkeley shrink-0 rounded bg-amber-950 px-1.5 py-1 text-[10px] text-amber-400 tabular-nums">
              {unavailableTrackCount.toLocaleString()} unavailable
            </span>
          )}
        </div>

        <div
          className={cn(
            "ml-auto mr-7.5 flex shrink-0 items-center gap-1 transition-[margin-right] duration-200 ease-linear md:mr-6 motion-reduce:transition-none",
            queueOpen && "md:mr-1",
          )}
        >
          {playlist && <PlaylistHeaderMenu playlist={playlist} />}
        </div>
      </header>

      {libraryMutation.error && (
        <p className="m-4 text-sm text-red-300" role="alert">
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
              className="text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              ref={menuTriggerRef}
              size="icon"
              variant="ghost"
            />
          }
        >
          <DotsThreeIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32 rounded-lg" finalFocus={false}>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
            Delete playlist
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
