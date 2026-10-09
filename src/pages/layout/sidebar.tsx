import { DotsThreeIcon, GearIcon, MusicNotesIcon, TrashIcon } from "@phosphor-icons/react";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { LibrarySource, PlaylistSummary } from "../../../shared/lib";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { usePlayback } from "@/hooks/use-playback";
import { getSourceName } from "@/lib/source-name";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const library = useMusicLibrary();
  const playback = usePlayback();
  const matchRoute = useMatchRoute();
  const isTracks = Boolean(matchRoute({ to: "/" }));

  return (
    <Sidebar className="border-separator bg-raised md:absolute! md:h-auto!">
      {/* the traffic lights and the sidebar toggle sit over this bar */}
      <SidebarHeader className="h-12 shrink-0 p-0 [-webkit-app-region:drag]" />

      <SidebarContent className="pb-2">
        <SidebarGroup className="px-2 pt-2 pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isTracks} render={<Link to="/" />}>
                  <MusicNotesIcon aria-hidden="true" weight={isTracks ? "fill" : "regular"} />
                  <span className="min-w-0 flex-1 truncate">Tracks</span>
                  {playback.queue?.source.kind === "all-tracks" && <PlayingFromDot />}
                  <NavCount count={library.tracks.length} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-2 pt-6 pb-0">
          <div className="flex items-center justify-between pr-1">
            <SidebarGroupLabel render={<h2 />}>Playlists</SidebarGroupLabel>
            <CreatePlaylistDialog />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {library.playlists.map((playlist) => (
                <PlaylistSidebarItem
                  isPlayingFrom={playback.activeSourcePlaylistId === playlist.id}
                  key={playlist.id}
                  playlist={playlist}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="h-12 shrink-0 flex-row items-center gap-2 border-t border-separator py-0 pr-2 pl-4">
        <SourceStatus sources={library.sources} />
        <Link
          aria-label="Settings"
          className={buttonVariants({ size: "icon", variant: "toolbar" })}
          to="/settings"
        >
          <GearIcon aria-hidden="true" />
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavCount({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-meta font-normal text-secondary tabular-nums",
        className,
      )}
    >
      {count.toLocaleString()}
    </span>
  );
}

function PlayingFromDot() {
  return (
    <span className="size-1.5 shrink-0 rounded-full bg-accent">
      <span className="sr-only">playing</span>
    </span>
  );
}

function PlaylistSidebarItem({
  isPlayingFrom,
  playlist,
}: {
  isPlayingFrom: boolean;
  playlist: PlaylistSummary;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const params = useParams({ strict: false });

  const isActive = params.playlistId === playlist.id;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        render={<Link params={{ playlistId: playlist.id }} to="/playlists/$playlistId" />}
      >
        <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
        {isPlayingFrom && <PlayingFromDot />}
        <NavCount
          className="min-w-6 text-right group-hover/menu-item:invisible group-has-focus-visible/menu-item:invisible group-has-data-popup-open/menu-item:invisible"
          count={playlist.trackCount}
        />
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction ref={menuTriggerRef} showOnHover>
              <DotsThreeIcon aria-hidden="true" />
              <span className="sr-only">More options for {playlist.title}</span>
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent>
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
    </SidebarMenuItem>
  );
}

const scanDateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function SourceStatus({ sources }: { sources: readonly LibrarySource[] }) {
  const now = useMinuteClock();
  const enabled = sources.filter((source) => source.enabled);
  const issues = enabled.filter((source) => source.lastScanError).length;
  const scannedAt = enabled.map((source) => source.lastScannedAt).filter((time) => time !== null);

  const name = sources.length === 1 ? getSourceName(sources[0].path) : `${sources.length} folders`;

  const [tone, detail] =
    sources.length === 0
      ? ["idle", null]
      : enabled.length === 0
        ? ["off", sources.length === 1 ? "off" : "all off"]
        : issues > 0
          ? ["issue", issues === 1 ? "1 issue" : `${issues} issues`]
          : ["idle", scannedAt.length > 0 ? formatScanAge(Math.min(...scannedAt), now) : null];

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "issue" && "bg-danger",
          tone === "off" && "bg-current text-tertiary",
          tone === "idle" && "bg-current text-disabled",
        )}
      />
      <p
        className="min-w-0 flex-1 truncate text-meta text-secondary"
        title={sources.map((source) => source.path).join("\n") || undefined}
      >
        {sources.length === 0 ? "No folders" : name}
        {detail && ` · ${detail}`}
      </p>
    </>
  );
}

function formatScanAge(scannedAt: number, now: number) {
  const minutes = Math.floor((now - scannedAt) / 60_000);

  if (minutes < 1) return "scanned just now";

  if (minutes < 60) return `scanned ${minutes}m`;

  if (minutes < 24 * 60) return `scanned ${Math.floor(minutes / 60)}h`;

  return `scanned ${scanDateFormatter.format(scannedAt)}`;
}

function useMinuteClock() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return now;
}
