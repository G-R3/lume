import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { ShortcutKeys } from "@/components/shortcut-keys";
import { PlaybackNotices } from "@/pages/layout/playback-notices";
import { AppSidebar } from "@/pages/layout/sidebar";
import { QueueSidebar } from "@/pages/layout/queue-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { PlaylistCreationProvider } from "@/hooks/use-playlist-creation";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { ariaKeyShortcuts, GLOBAL_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const library = useMusicLibrary();
  const playback = usePlayback();
  const syncLibrary = playback.syncLibrary;
  const [queueOpen, setQueueOpen] = useState(false);
  const toggleQueue = () => setQueueOpen((open) => !open);

  useEffect(() => {
    syncLibrary(library);
  }, [library, syncLibrary]);

  if (!playback.isInitialized) return <div className="min-h-screen bg-page" />;

  return (
    <SidebarProvider className="h-svh flex-col bg-page text-primary">
      <PlaylistCreationProvider>
        <AppKeyboardShortcuts toggleQueue={toggleQueue} />
        <div className="relative flex min-h-0 flex-1 overflow-x-clip">
          <AppSidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <AudioPlayerControls queueOpen={queueOpen} toggleQueue={toggleQueue} />
            <div className="relative flex min-h-0 flex-1">
              <SidebarInset className="min-h-0 min-w-0 overflow-auto bg-page scroll-area-scrollbar">
                <div className="flex min-h-0 flex-1 flex-col">
                  <PlaybackNotices
                    className={queueOpen ? "sr-only" : "not-empty:px-6 not-empty:pt-4"}
                    notices={playback.notices}
                    role="alert"
                  />
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
              shortcut={{
                ariaKeyShortcuts: ariaKeyShortcuts(GLOBAL_SHORTCUTS.toggleSidebar.chord),
                label: <ShortcutKeys chord={GLOBAL_SHORTCUTS.toggleSidebar.chord} />,
              }}
            />
          </div>
        </div>
      </PlaylistCreationProvider>
    </SidebarProvider>
  );
}
