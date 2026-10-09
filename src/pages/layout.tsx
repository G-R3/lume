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

        {/* right-sidebar drag region */}
        {window.lume.isMac && queueOpen && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 right-0 z-50 h-12 [-webkit-app-region:drag]"
            style={{ width: QUEUE_SIDEBAR_WIDTH }}
          />
        )}

        <SidebarInset className="min-h-0 overflow-auto bg-page">
          <AppHeader isSettings={isSettings} queueOpen={queueOpen} />
          {/* after every drag region in the DOM: Electron applies app regions in document order, so a
              later drag region would swallow clicks on these buttons */}
          <div
            className={cn(
              "pointer-events-none fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between pr-2 sm:pr-3",
              window.lume.isMac ? "pl-20" : "pl-4",
            )}
          >
            <SidebarTrigger
              className="pointer-events-auto [-webkit-app-region:no-drag]"
              shortcut={getSidebarShortcut(window.lume.isMac)}
            />
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
