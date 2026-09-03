import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { AppHeader } from "@/pages/layout/header";
import { AppSidebar } from "@/pages/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const library = useMusicLibrary();
  const audioPlayer = useAudioPlayer();
  const syncTracks = audioPlayer.syncTracks;
  const isSettings = useLocation({
    select: (location) =>
      location.pathname === "/settings" || location.pathname.startsWith("/settings/"),
  });

  useEffect(() => {
    syncTracks(library.tracks);
  }, [library.tracks, syncTracks]);

  return (
    <>
      <SidebarProvider className="bg-neutral-950 text-neutral-50">
        <AppKeyboardShortcuts />
        <AppSidebar isSettings={isSettings} />

        {window.lume.isMac && (
          <>
            <div className="font-berkeley fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center text-[10px] tracking-[0.08em] text-neutral-500 [-webkit-app-region:drag]">
              Lume
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 z-50 h-9 w-(--sidebar-width) border-r border-neutral-800 bg-sidebar transition-[width] duration-200 ease-linear peer-data-[state=collapsed]:w-0 peer-data-[state=collapsed]:border-r-0"
            />
          </>
        )}

        <SidebarInset className={cn("bg-black", window.lume.isMac && "pt-9")}>
          <AppHeader isSettings={isSettings} />
          <div className="flex-1 pb-28">
            {audioPlayer.errorMessage && (
              <p className="m-4 text-sm text-red-300" role="alert">
                {audioPlayer.errorMessage}
              </p>
            )}
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>

      <AudioPlayerControls />
    </>
  );
}
