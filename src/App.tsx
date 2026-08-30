import { GearIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryUpdate, MusicLibrary, ScanFailure } from "../shared/lib";
import { LibraryEmptyState } from "@/components/library-empty-state";
import { LibraryStatus } from "@/components/library-status";
import { ScanErrorToast } from "@/components/scan-error-toast";
import { SourceSettings } from "@/components/source-settings";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  const [library, setLibrary] = useState<MusicLibrary | null>();
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanFailures, setScanFailures] = useState<ScanFailure[]>([]);
  const [route, setRoute] = useState(window.location.hash);
  const hasLoadedSavedLibrary = useRef(false);
  const audioPlayer = useAudioPlayer();
  const syncTracks = audioPlayer.syncTracks;
  const isMac = window.lume.isMac;
  const sourcePaths = library?.sources.map((source) => source.path);
  const unavailableTrackCount = library?.tracks.filter((track) => !track.available).length ?? 0;
  const sourceSummary =
    sourcePaths?.length === 1
      ? sourcePaths[0]
      : sourcePaths?.length
        ? `${sourcePaths.length.toLocaleString()} sources`
        : null;

  const requestLibrary = useCallback(async (request: () => Promise<LibraryUpdate>) => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);
    setScanFailures([]);

    try {
      const update = await request();

      setLibrary(update.library);
      setScanFailures(update.scanFailures);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load the library");
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  const dismissScanFailures = useCallback(() => setScanFailures([]), []);

  useEffect(() => {
    if (hasLoadedSavedLibrary.current) return;

    hasLoadedSavedLibrary.current = true;
    void requestLibrary(window.lume.loadLibrary);
  }, [requestLibrary]);

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    if (library) syncTracks(library.tracks);
  }, [library, syncTracks]);

  const isSourceSettings = route === "#settings/sources";

  if (library === undefined) return <div className="min-h-screen bg-black" />;

  if (library === null) {
    return (
      <LibraryEmptyState
        errorMessage={errorMessage}
        isLoading={isLoadingLibrary}
        isMac={isMac}
        onAddSource={() => void requestLibrary(window.lume.addSource)}
      />
    );
  }

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
                <nav aria-label={isSourceSettings ? "Settings" : "Library"}>
                  <SidebarMenu>
                    {isSourceSettings ? (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          aria-current="page"
                          className="text-neutral-400"
                          isActive
                          render={<a href="#settings/sources" />}
                        >
                          <GearIcon aria-hidden="true" />
                          <span>Sources</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ) : (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          aria-current="page"
                          className="text-neutral-400"
                          isActive
                          render={<a href="#tracks" />}
                        >
                          <MusicNotesIcon aria-hidden="true" />
                          <span>All tracks</span>
                          <span className="font-berkeley ml-auto rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-500 tabular-nums">
                            {library.tracks.length.toLocaleString()}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </nav>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-neutral-400"
                  render={<a href={isSourceSettings ? "#tracks" : "#settings/sources"} />}
                >
                  {isSourceSettings ? (
                    <MusicNotesIcon aria-hidden="true" />
                  ) : (
                    <GearIcon aria-hidden="true" />
                  )}
                  <span>{isSourceSettings ? "Back to library" : "Settings"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>

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
            <h1 className="text-sm font-semibold tracking-tight">
              {isSourceSettings ? "Settings" : "All tracks"}
            </h1>
            {!isSourceSettings && (
              <span className="font-berkeley text-[10px] text-neutral-400 tabular-nums bg-neutral-800 py-1 px-1.5 rounded">
                {library.tracks.length.toLocaleString()}
              </span>
            )}
            {!isSourceSettings && unavailableTrackCount > 0 && (
              <span className="font-berkeley rounded bg-amber-950 px-1.5 py-1 text-[10px] text-amber-400 tabular-nums">
                {unavailableTrackCount.toLocaleString()} unavailable
              </span>
            )}

            {!isSourceSettings && (
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
                  onClick={() => void requestLibrary(window.lume.addSource)}
                  type="button"
                  variant="outline"
                >
                  Add source
                </Button>

                {library.sources.some((source) => source.enabled) && (
                  <Button
                    className="border-lime-800 bg-lime-950 text-lime-300 hover:bg-lime-900 hover:text-lime-200"
                    disabled={isLoadingLibrary}
                    onClick={() => void requestLibrary(window.lume.rescanSources)}
                    type="button"
                    variant="outline"
                  >
                    {isLoadingLibrary ? "Scanning..." : "Rescan"}
                  </Button>
                )}
              </div>
            )}
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
            {isSourceSettings ? (
              <SourceSettings
                isLoading={isLoadingLibrary}
                library={library}
                requestLibrary={requestLibrary}
              />
            ) : (
              <>
                <LibraryStatus
                  isLoading={isLoadingLibrary}
                  library={library}
                  requestLibrary={requestLibrary}
                />
                {library.tracks.length > 0 && <TrackList tracks={library.tracks} />}
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <AudioPlayerControls />
      <ScanErrorToast
        failures={scanFailures}
        onDismiss={dismissScanFailures}
        sources={library.sources}
      />
    </>
  );
}

export default App;
