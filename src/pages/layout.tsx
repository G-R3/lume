import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { AppHeader } from "@/pages/layout/header";
import { AppSidebar } from "@/pages/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMusicLibrary } from "@/hooks/use-music-library";

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
        <AppSidebar />

        {window.lume.isMac && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 z-50 h-9 w-(--sidebar-width) border-r border-neutral-800 bg-sidebar transition-[width] duration-200 ease-linear peer-data-[state=collapsed]:w-0 peer-data-[state=collapsed]:border-r-0 motion-reduce:transition-none [-webkit-app-region:drag]"
          />
        )}

        <SidebarInset className="bg-black">
          <AppHeader isSettings={isSettings} />
          <div className="flex-1 pb-28">
            {audioPlayer.errorMessage && (
              <p className="m-4 text-sm text-red-300" role="alert">
                {audioPlayer.errorMessage}
              </p>
            )}
            <Outlet />
          </div>
          <AudioPlayerControls />
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
