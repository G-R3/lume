import { FolderOpenIcon, GearIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LibrarySnapshot } from "../shared/lib";
import { LibraryEmptyState } from "@/components/library-empty-state";
import { CreatePlaylistDialog } from "@/components/create-playlist-dialog";
import { LibraryStatus } from "@/components/library-status";
import { SourceSettings } from "@/components/source-settings";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
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
  const [library, setLibrary] = useState<LibrarySnapshot>();
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [route, setRoute] = useState(window.location.hash);
  const hasRequestedLibrary = useRef(false);
  const initialLibraryRequest = useRef<Promise<void>>(Promise.resolve());
  const audioPlayer = useAudioPlayer();
  const syncTracks = audioPlayer.syncTracks;
  const isMac = window.lume.isMac;
  const sourcePaths =
    library?.kind === "library" ? library.sources.map((source) => source.path) : null;
  const unavailableTrackCount =
    library?.kind === "library" ? library.tracks.filter((track) => !track.available).length : 0;
  const sourceSummary =
    sourcePaths?.length === 1
      ? sourcePaths[0]
      : sourcePaths?.length
        ? `${sourcePaths.length.toLocaleString()} sources`
        : null;

  const requestLibrary = useCallback(async (request: () => Promise<LibrarySnapshot>) => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);

    try {
      setLibrary(await request());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load the library");
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (hasRequestedLibrary.current) return;

    hasRequestedLibrary.current = true;
    initialLibraryRequest.current = requestLibrary(window.lume.loadLibrary);
  }, [requestLibrary]);

  useEffect(
    () =>
      window.lume.onLibraryUpdate((library) => {
        void initialLibraryRequest.current.then(() => {
          setLibrary(library);
        });
      }),
    [],
  );

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    if (library?.kind === "library") syncTracks(library.tracks);
  }, [library, syncTracks]);

  const isSettings = route.startsWith("#settings/");

  if (library === undefined) {
    if (!errorMessage) return <div className="min-h-screen bg-black" />;

    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-neutral-50">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lume could not load your library</h1>
          <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
            {errorMessage}
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Button
              className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
              onClick={() => void requestLibrary(window.lume.loadLibrary)}
              type="button"
            >
              Try again
            </Button>
            <Button
              className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              onClick={() =>
                void window.lume
                  .openDataFolder()
                  .catch((error: Error) => setErrorMessage(error.message))
              }
              type="button"
              variant="outline"
            >
              Open data folder
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (library.kind === "first-run") {
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
                          render={<a href="#tracks" />}
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
                  <CreatePlaylistDialog onCreated={setLibrary} />
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {library.playlists.map((playlist) => (
                        <SidebarMenuItem key={playlist.id}>
                          <SidebarMenuButton className="text-neutral-400">
                            <span>{playlist.title}</span>
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="font-berkeley rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-500 tabular-nums">
                            {playlist.entryCount.toLocaleString()}
                          </SidebarMenuBadge>
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
                        render={<a href="#settings/sources" />}
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
                  render={<a href={isSettings ? "#tracks" : "#settings/sources"} />}
                >
                  {isSettings ? (
                    <MusicNotesIcon aria-hidden="true" />
                  ) : (
                    <GearIcon aria-hidden="true" />
                  )}
                  <span>{isSettings ? "Back to library" : "Settings"}</span>
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
              {isSettings ? "Settings" : "All tracks"}
            </h1>
            {!isSettings && (
              <span className="font-berkeley text-[10px] text-neutral-400 tabular-nums bg-neutral-800 py-1 px-1.5 rounded">
                {library.tracks.length.toLocaleString()}
              </span>
            )}
            {!isSettings && unavailableTrackCount > 0 && (
              <span className="font-berkeley rounded bg-amber-950 px-1.5 py-1 text-[10px] text-amber-400 tabular-nums">
                {unavailableTrackCount.toLocaleString()} unavailable
              </span>
            )}

            {!isSettings && (
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
            {isSettings ? (
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
    </>
  );
}

export default App;
