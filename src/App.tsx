import { useCallback, useEffect, useRef, useState } from "react";
import type { MusicLibrary } from "../shared/lib";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TrackList } from "@/components/track-list";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { AudioPlayerControls } from "@/components/audio-player-controls";
import { AppKeyboardShortcuts } from "@/components/app-keyboard-shortcuts";
import { cn } from "@/lib/utils";

function App() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedSavedLibrary = useRef(false);
  const audioPlayer = useAudioPlayer();
  const isMac = window.lume.isMac;
  const sourcePaths = library?.sources.map((source) => source.path);
  const sourceSummary =
    sourcePaths?.length === 1
      ? sourcePaths[0]
      : sourcePaths && `${sourcePaths.length.toLocaleString()} sources`;

  const requestLibrary = useCallback(async (request: () => Promise<MusicLibrary | null>) => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);

    try {
      const library = await request();

      if (!library) return;

      setLibrary(library);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load the library");
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedSavedLibrary.current) return;

    hasLoadedSavedLibrary.current = true;
    void requestLibrary(window.lume.loadMusicLibrary);
  }, [requestLibrary]);

  return (
    <>
      <SidebarProvider className="bg-neutral-950 text-neutral-50">
        <AppKeyboardShortcuts />
        <Sidebar className="border-neutral-800">
          <SidebarHeader className={cn("px-4 pb-3", isMac ? "pt-13" : "pt-4")}>
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
                <nav aria-label="Library">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        aria-current="page"
                        className="text-neutral-400"
                        isActive
                        render={<a href="#tracks" />}
                      >
                        <span>All tracks</span>
                        {library && (
                          <span className="font-berkeley ml-auto text-[10px] text-neutral-500 tabular-nums bg-neutral-800 py-1 px-1.5 rounded">
                            {library.tracks.length.toLocaleString()}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </nav>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarRail />
        </Sidebar>

        {isMac && (
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

        <SidebarInset className={cn("bg-black", isMac && "pt-9")}>
          <header className="flex h-12.5 shrink-0 items-center gap-2 border-b border-neutral-800 px-5">
            <SidebarTrigger className="-ml-1.5" />
            <Separator
              className="mx-1 h-4 bg-neutral-800 data-vertical:self-center!"
              orientation="vertical"
            />
            <h1 className="text-sm font-semibold tracking-tight">All tracks</h1>
            {library && (
              <span className="font-berkeley text-[10px] text-neutral-400 tabular-nums bg-neutral-800 py-1 px-1.5 rounded">
                {library.tracks.length.toLocaleString()}
              </span>
            )}

            <div className="ml-auto flex min-w-0 items-center gap-2">
              {sourceSummary && (
                <span
                  className="hidden max-w-48 truncate text-[10px] text-neutral-400 lg:block"
                  title={sourcePaths?.join("\n")}
                >
                  {sourceSummary}
                </span>
              )}
              <Button
                className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
                disabled={isLoadingLibrary}
                onClick={() => void requestLibrary(window.lume.chooseMusicFolder)}
                type="button"
                variant="outline"
              >
                {library ? "Add music folder" : "Choose music folder"}
              </Button>

              {library && (
                <Button
                  className="border-lime-800 bg-lime-950 text-lime-300 hover:bg-lime-900 hover:text-lime-200"
                  disabled={isLoadingLibrary}
                  onClick={() => void requestLibrary(window.lume.rescanMusicLibrary)}
                  type="button"
                  variant="outline"
                >
                  {isLoadingLibrary ? "Scanning..." : "Rescan"}
                </Button>
              )}
            </div>
          </header>

          <div className="flex-1 pb-28">
            {errorMessage && (
              <p className="m-4 text-sm text-red-300" role="alert">
                {errorMessage}
              </p>
            )}
            {audioPlayer.errorMessage && (
              <p className="m-4 text-sm text-red-300" role="alert">
                {audioPlayer.errorMessage}
              </p>
            )}
            {library && library.tracks.length > 0 && <TrackList tracks={library.tracks} />}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <AudioPlayerControls />
    </>
  );
}

export default App;
