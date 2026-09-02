import { FolderOpenIcon, GearIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import type { LibrarySnapshot, MusicLibrary } from "../shared/lib";
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
import { libraryQuery } from "@/lib/library-query";
import { cn } from "@/lib/utils";

function App() {
  const library = useQuery(libraryQuery);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  if (library.data === undefined) {
    if (!library.error) return <div className="min-h-screen bg-black" />;

    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-neutral-50">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lume could not load your library</h1>
          <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
            {recoveryError ?? library.error.message}
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Button
              className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
              onClick={() => {
                setRecoveryError(null);
                void library.refetch();
              }}
              type="button"
            >
              Try again
            </Button>
            <Button
              className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              onClick={() =>
                void window.lume
                  .openDataFolder()
                  .catch((error: Error) => setRecoveryError(error.message))
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

  if (library.data.kind === "first-run") return <FirstRun />;

  return <LibraryApp library={library.data} />;
}

function FirstRun() {
  const queryClient = useQueryClient();
  const addSource = useMutation({
    mutationFn: window.lume.addSource,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library) => queryClient.setQueryData(libraryQuery.queryKey, library),
  });

  return (
    <LibraryEmptyState
      errorMessage={addSource.error?.message ?? null}
      isLoading={addSource.isPending}
      isMac={window.lume.isMac}
      onAddSource={() => addSource.mutate()}
    />
  );
}

const MusicLibraryContext = createContext<MusicLibrary | null>(null);

function LibraryApp({ library }: { library: MusicLibrary }) {
  const queryClient = useQueryClient();
  const libraryMutation = useMutation({
    mutationFn: (request: () => Promise<LibrarySnapshot>) => request(),
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library) => queryClient.setQueryData(libraryQuery.queryKey, library),
  });
  const audioPlayer = useAudioPlayer();
  const syncTracks = audioPlayer.syncTracks;
  const isMac = window.lume.isMac;
  const isSettings = useRouterState({
    select: (state) => state.location.pathname === "/settings/sources",
  });
  const sourcePaths = library.sources.map((source) => source.path);
  const unavailableTrackCount = library.tracks.filter((track) => !track.available).length;
  const sourceSummary =
    sourcePaths.length === 1
      ? sourcePaths[0]
      : sourcePaths.length
        ? `${sourcePaths.length.toLocaleString()} sources`
        : null;

  useEffect(
    () =>
      window.lume.onLibraryUpdate((library) => {
        queryClient.setQueryData(libraryQuery.queryKey, library);
      }),
    [queryClient],
  );

  useEffect(() => {
    syncTracks(library.tracks);
  }, [library.tracks, syncTracks]);

  return (
    <MusicLibraryContext.Provider value={library}>
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
                          render={<Link to="/tracks" />}
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
                  <CreatePlaylistDialog />
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
                        render={<Link to="/settings/sources" />}
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
                  render={isSettings ? <Link to="/tracks" /> : <Link to="/settings/sources" />}
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
                  disabled={libraryMutation.isPending}
                  onClick={() => libraryMutation.mutate(window.lume.addSource)}
                  type="button"
                  variant="outline"
                >
                  Add source
                </Button>

                {library.sources.some((source) => source.enabled) && (
                  <Button
                    className="border-lime-800 bg-lime-950 text-lime-300 hover:bg-lime-900 hover:text-lime-200"
                    disabled={libraryMutation.isPending}
                    onClick={() => libraryMutation.mutate(window.lume.rescanSources)}
                    type="button"
                    variant="outline"
                  >
                    {libraryMutation.isPending ? "Scanning..." : "Rescan"}
                  </Button>
                )}
              </div>
            )}
          </header>

          <div className="flex-1 pb-28">
            {libraryMutation.error && (
              <p className="m-4 text-sm text-red-300" role="alert">
                {libraryMutation.error.message}
              </p>
            )}
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
    </MusicLibraryContext.Provider>
  );
}

export function TracksRoute() {
  const library = useMusicLibrary();

  return (
    <>
      <LibraryStatus library={library} />
      {library.tracks.length > 0 && <TrackList tracks={library.tracks} />}
    </>
  );
}

export function SourcesRoute() {
  const library = useMusicLibrary();

  return <SourceSettings library={library} />;
}

function useMusicLibrary() {
  const library = useContext(MusicLibraryContext);

  if (!library) throw new Error("Library routes must render within LibraryApp");
  return library;
}

export default App;
