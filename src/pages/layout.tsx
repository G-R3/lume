import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { AppHeader } from "@/pages/layout/header";
import { AppSidebar } from "@/pages/layout/sidebar";
import { QueueSidebar } from "@/pages/layout/queue-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { getSidebarShortcut } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const library = useMusicLibrary();
  const playback = usePlayback();
  const syncLibrary = playback.syncLibrary;
  const [queueOpen, setQueueOpen] = useState(false);
  const toggleQueue = () => setQueueOpen((open) => !open);

  const isSettings = useLocation({
    select: (location) =>
      location.pathname === "/settings" || location.pathname.startsWith("/settings/"),
  });

  useEffect(() => {
    syncLibrary(library);
  }, [library, syncLibrary]);

  if (!playback.isInitialized) return <div className="min-h-screen bg-page" />;

  return (
    <SidebarProvider className="h-svh flex-col bg-page text-primary">
      <AppKeyboardShortcuts toggleQueue={toggleQueue} />
      <div className="relative flex min-h-0 flex-1 overflow-x-clip">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <AudioPlayerControls queueOpen={queueOpen} toggleQueue={toggleQueue} />
          <div className="relative flex min-h-0 flex-1">
            <SidebarInset className="min-h-0 min-w-0 overflow-auto bg-page">
              <AppHeader isSettings={isSettings} />
              <div className="flex-1">
                {playback.errorMessage && (
                  <p className="m-4 text-sm text-danger" role="alert">
                    {playback.errorMessage}
                  </p>
                )}
                <Outlet />
              </div>
            </SidebarInset>
            <QueueSidebar onOpenChange={setQueueOpen} open={queueOpen} />
          </div>
        </div>
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 top-0 z-50 flex h-12 items-center",
            window.lume.isMac ? "pl-22" : "pl-4",
          )}
        >
          <SidebarTrigger
            className="pointer-events-auto [-webkit-app-region:no-drag]"
            shortcut={getSidebarShortcut(window.lume.isMac)}
          />
        </div>
      </div>
    </SidebarProvider>
  );
}
