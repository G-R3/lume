import { ContextMenu } from "@base-ui/react/context-menu";
import {
  DotsThreeIcon,
  GearIcon,
  MusicNotesIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { type Ref, type RefObject, useRef, useState } from "react";
import type { MusicLibrary, PlaylistSummary } from "../../../shared/lib";
import { DeletePlaylistDialog } from "@/components/delete-playlist-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { duration, ease } from "@/lib/motion";
import { presentLibrarySources } from "@/lib/source-presentation";
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
  const isTracks = Boolean(matchRoute({ to: "/" }));
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const openPlaylistCreation = usePlaylistCreation();

  return (
    <Sidebar className="border-separator bg-raised surface-raised md:absolute! md:h-auto!">
      <SidebarHeader className="h-12 shrink-0 p-0 [-webkit-app-region:drag]" />

      <SidebarContent className="pb-2 scroll-area-scrollbar [scrollbar-width:auto]! [&::-webkit-scrollbar]:block!">
        <SidebarGroup className="px-2 pt-2 pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isTracks} render={<Link to="/" />}>
                  <MusicNotesIcon aria-hidden="true" weight={isTracks ? "fill" : "regular"} />
                  <span className="min-w-0 flex-1 truncate">Tracks</span>

                  <NavCount count={library.tracks.length} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-2 pt-6 pb-0">
          <div className="flex items-center justify-between pr-1">
            <SidebarGroupLabel render={<h2 />}>Playlists</SidebarGroupLabel>
            <Button
              aria-keyshortcuts={window.lume.isMac ? "Meta+N" : "Control+N"}
              aria-label="Create playlist"
              onClick={() => openPlaylistCreation({ finalFocus: createTriggerRef, target: null })}
              ref={createTriggerRef}
              size="icon-sm"
              variant="ghost"
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="relative">
              <AnimatePresence initial={false} mode="popLayout">
                {library.playlists.map((playlist, index) => (
                  <PlaylistSidebarItem
                    createTriggerRef={createTriggerRef}
                    key={playlist.id}
                    neighborId={(library.playlists[index + 1] ?? library.playlists[index - 1])?.id}
                    playlist={playlist}
                  />
                ))}
              </AnimatePresence>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="h-12 shrink-0 flex-row items-center gap-2 border-t border-separator py-0 pr-2 pl-4">
        <SourceFooter library={library} />
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

const MotionSidebarMenuItem = motion.create(SidebarMenuItem);

function PlaylistSidebarItem({
  createTriggerRef,
  neighborId,
  playlist,
  ref,
}: {
  createTriggerRef: RefObject<HTMLButtonElement | null>;
  neighborId: number | undefined;
  playlist: PlaylistSummary;
  ref?: Ref<HTMLLIElement>;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const params = useParams({ strict: false });

  const isActive = params.playlistId === playlist.id;

  const menuItems = (
    <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="danger">
      <TrashIcon aria-hidden="true" />
      Delete playlist
    </DropdownMenuItem>
  );

  return (
    <MotionSidebarMenuItem
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.out }, y: -4 }}
      initial={{ opacity: 0, y: -4 }}
      layout="position"
      ref={ref}
      transition={{
        duration: duration.enter,
        ease: ease.out,
        layout: { duration: duration.move, ease: ease.inOut },
      }}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <SidebarMenuButton
              data-playlist-id={playlist.id}
              isActive={isActive}
              render={<Link params={{ playlistId: playlist.id }} to="/playlists/$playlistId" />}
            />
          }
        >
          <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
          <NavCount
            className="min-w-6 text-right group-hover/menu-item:invisible group-has-focus-visible/menu-item:invisible group-has-data-popup-open/menu-item:invisible"
            count={playlist.trackCount}
          />
        </ContextMenu.Trigger>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`More options for ${playlist.title}`}
                className="absolute top-1 right-1 opacity-0 group-hover/menu-item:opacity-100 group-has-focus-visible/menu-item:opacity-100 data-popup-open:opacity-100"
                onMouseDown={(event) => event.preventDefault()}
                ref={menuTriggerRef}
                size="icon-sm"
                static
                variant="row-action"
              />
            }
          >
            <DotsThreeIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menuItems}</DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenuContent side="right" sideOffset={0}>
          {menuItems}
        </DropdownMenuContent>
      </ContextMenu.Root>
      <DeletePlaylistDialog
        finalFocus={menuTriggerRef}
        focusAfterDelete={() =>
          neighborId !== undefined
            ? document.querySelector<HTMLElement>(`[data-playlist-id="${neighborId}"]`)
            : createTriggerRef.current
        }
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        playlist={playlist}
      />
    </MotionSidebarMenuItem>
  );
}

function SourceFooter({ library }: { library: MusicLibrary }) {
  const footer = presentLibrarySources(library, useMinuteClock()).footer;

  return (
    <p className="min-w-0 flex-1 truncate text-meta text-secondary" title={footer.tooltip}>
      {footer.text}
    </p>
  );
}
