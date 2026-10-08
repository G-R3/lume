import { DotsThreeIcon, GearIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { PlaylistSummary } from "../../../shared/lib";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const library = useMusicLibrary();
  const matchRoute = useMatchRoute();
  const isAllTracks = Boolean(matchRoute({ to: "/" }));
  const isSettings = Boolean(matchRoute({ to: "/settings" }));

  return (
    <Sidebar className="border-default md:absolute! md:h-auto!">
      <SidebarHeader className={cn("px-4 pb-3", window.lume.isMac ? "pt-15" : "pt-18.5")}>
        <div className="flex items-center gap-2.5 px-1 text-sm font-semibold tracking-wide">
          <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
            {[5, 12, 8, 14, 6].map((height) => (
              <span className="w-0.5 rounded-full bg-current" key={height} style={{ height }} />
            ))}
          </span>
          Lume
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-secondary"
                  isActive={isAllTracks}
                  render={<Link to="/" />}
                >
                  <MusicNotesIcon aria-hidden="true" />
                  <span>All tracks</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="font-mono rounded bg-selected px-1.5 py-1 text-[10px] text-tertiary tabular-nums">
                  {library.tracks.length.toLocaleString()}
                </SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-secondary"
                  isActive={isSettings}
                  render={<Link to="/settings" />}
                >
                  <GearIcon aria-hidden="true" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-tertiary">Playlists</SidebarGroupLabel>
          <CreatePlaylistDialog />
          <SidebarGroupContent>
            <SidebarMenu>
              {library.playlists.map((playlist) => (
                <PlaylistSidebarItem key={playlist.id} playlist={playlist} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

function PlaylistSidebarItem({ playlist }: { playlist: PlaylistSummary }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const params = useParams({ strict: false });

  const isActive = params.playlistId === playlist.id;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="text-secondary"
        isActive={isActive}
        render={<Link params={{ playlistId: playlist.id }} to="/playlists/$playlistId" />}
      >
        <span>{playlist.title}</span>
      </SidebarMenuButton>
      <SidebarMenuBadge className="group-has-data-popup-open/menu-item:hidden group-focus-within/menu-item:hidden group-hover/menu-item:hidden font-mono rounded bg-selected px-1.5 py-1 text-[10px] text-tertiary tabular-nums">
        {playlist.trackCount.toLocaleString()}
      </SidebarMenuBadge>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction ref={menuTriggerRef} showOnHover>
              <DotsThreeIcon aria-hidden="true" />
              <span className="sr-only">More options for {playlist.title}</span>
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent className="w-32 rounded-lg" finalFocus={false}>
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
    </SidebarMenuItem>
  );
}
