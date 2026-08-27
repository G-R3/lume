import { useState } from "react";
import type { MusicLibrary } from "../shared/lib";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TrackList } from "@/components/track-list";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { AudioPlayerControls } from "@/components/audio-player-controls";

function App() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioPlayer = useAudioPlayer();

  const chooseMusicFolder = async () => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);

    try {
      const library = await window.lume.chooseMusicFolder();

      if (!library) return;

      setLibrary(library);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Library scan failed",
      );
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  return (
    <div className="flex flex-col">
      <SidebarProvider className="dark bg-black text-white">
        <Sidebar>
          <SidebarHeader />

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Music Library</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuButton isActive>All tracks</SidebarMenuButton>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-svh bg-black text-white">
          <header className="flex h-12 shrink-0 items-center border-b border-white/10 px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-2 h-4" />
            <h1 className="font-semibold tracking-tight">All tracks</h1>
          </header>

          <main className="flex flex-1 flex-col gap-6 p-6 pb-28">
            <div>
              <Button
                disabled={isLoadingLibrary}
                onClick={chooseMusicFolder}
                type="button"
              >
                {isLoadingLibrary
                  ? "Loading Music Folder..."
                  : "Choose Music Folder"}
              </Button>
            </div>

            {errorMessage && <p role="alert">{errorMessage}</p>}
            {audioPlayer.errorMessage && (
              <p role="alert">{audioPlayer.errorMessage}</p>
            )}
            {library?.tracks && library.tracks.length > 0 && (
              <TrackList tracks={library?.tracks} />
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>

      <AudioPlayerControls />
    </div>
  );
}

export default App;
