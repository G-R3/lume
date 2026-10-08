import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/pages/layout/header";
import { AppSidebar } from "@/pages/layout/sidebar";
import { QUEUE_SIDEBAR_WIDTH, QueueSidebar } from "@/pages/layout/queue-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { useMusicLibrary } from "@/hooks/use-music-library";
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

        {/* left-sidebar drag region */}
        {window.lume.isMac && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 z-50 h-9 w-(--sidebar-width) border-r border-default bg-page transition-[width] duration-200 ease-linear peer-data-[state=collapsed]:w-0 peer-data-[state=collapsed]:border-r-0 motion-reduce:transition-none [-webkit-app-region:drag]"
          />
        )}
        {/* right-sidebar drag region */}
        {window.lume.isMac && queueOpen && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 right-0 z-50 h-9 [-webkit-app-region:drag]"
            style={{ width: QUEUE_SIDEBAR_WIDTH }}
          />
        )}

        <SidebarInset className="min-h-0 overflow-auto bg-page">
          <AppHeader isSettings={isSettings} queueOpen={queueOpen} />
          <div
            className={cn(
              "pointer-events-none fixed inset-x-0 top-0 z-50 flex h-12.5 items-center justify-between pr-2 pl-3.5 sm:pr-3",
              window.lume.isMac ? "h-9 pl-20" : "md:pl-5",
            )}
          >
            <SidebarTrigger className="pointer-events-auto [-webkit-app-region:no-drag]" />
            <Button
              aria-controls="queue-sidebar"
              aria-expanded={queueOpen}
              aria-label={queueOpen ? "Close queue sidebar" : "Open queue sidebar"}
              className="pointer-events-auto [-webkit-app-region:no-drag]"
              onClick={toggleQueue}
              size="icon"
              type="button"
              variant="toolbar"
            >
              <SidebarSimpleIcon
                aria-hidden="true"
                className="-scale-x-100"
                weight={queueOpen ? "fill" : "regular"}
              />
            </Button>
          </div>
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
      <AudioPlayerControls />
    </SidebarProvider>
  );
}
