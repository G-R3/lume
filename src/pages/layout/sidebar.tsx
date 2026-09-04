import { DotsThreeIcon, FolderOpenIcon, GearIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
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
import { useLibrary } from "@/lib/library-query";

export function AppSidebar({ isSettings }: { isSettings: boolean }) {
  const library = useMusicLibrary();
  const libraryMutation = useLibrary(
    (request: () => ReturnType<typeof window.lume.deletePlaylist>) => request(),
  );

  return (
    <Sidebar className="border-neutral-800">
      <SidebarHeader className={cn("px-4 pb-3", window.lume.isMac ? "pt-13" : "pt-4")}>
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
        {!isSettings ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      aria-current="page"
                      className="text-neutral-400"
                      isActive
                      render={<Link to="/" />}
                    >
                      <MusicNotesIcon aria-hidden="true" />
                      <span>All tracks</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="font-berkeley rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-500 tabular-nums">
                      {library.tracks.length.toLocaleString()}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="text-neutral-500">Playlists</SidebarGroupLabel>
              <CreatePlaylistDialog />
              <SidebarGroupContent>
                <SidebarMenu>
                  {library.playlists.map((playlist) => (
                    <SidebarMenuItem key={playlist.id}>
                      <SidebarMenuButton className="text-neutral-400">
                        <span>{playlist.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="group-has-data-popup-open/menu-item:hidden group-focus-within/menu-item:hidden group-hover/menu-item:hidden font-berkeley rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-500 tabular-nums">
                        {playlist.entryCount.toLocaleString()}
                      </SidebarMenuBadge>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <SidebarMenuAction showOnHover>
                              <DotsThreeIcon />
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          }
                        ></DropdownMenuTrigger>

                        <DropdownMenuContent finalFocus={false} className="w-32 rounded-lg">
                          <DropdownMenuItem
                            onClick={() =>
                              libraryMutation.mutate(() => window.lume.deletePlaylist(playlist.id))
                            }
                          >
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-current="page"
                    className="text-neutral-400"
                    isActive
                    render={<Link to="/settings" />}
                  >
                    <FolderOpenIcon aria-hidden="true" />
                    <span>Sources</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-neutral-400"
              render={isSettings ? <Link to="/" /> : <Link to="/settings" />}
            >
              {isSettings ? <MusicNotesIcon aria-hidden="true" /> : <GearIcon aria-hidden="true" />}
              <span>{isSettings ? "Back to library" : "Settings"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
