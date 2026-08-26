import { useRef, useState } from "react";
import type { MusicLibrary } from "../shared/lib";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format-duration";
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

function App() {
  const playerRef = useRef<HTMLAudioElement>(null);
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const chooseMusicFolder = async () => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);

    try {
      const library = await window.lume.chooseMusicFolder();

      if (!library) return;

      setLibrary(library);
      setSelectedTrackId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Library scan failed",
      );
    } finally {
      setIsLoadingLibrary(false);
    }
  };
  const selectedTrack =
    library?.tracks.find((track) => track.id === selectedTrackId) ?? null;

  return (
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

        <main className="flex flex-1 flex-col gap-6 p-6">
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

          {library && (
            <div className="overflow-hidden rounded-md border border-white/10">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-white/10 text-left text-white/60">
                  <tr>
                    <th className="w-14 px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="w-28 px-4 py-3 font-medium">Format</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {library.tracks.map((track, index) => (
                    <tr
                      className={
                        selectedTrack?.id === track.id
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                      }
                      key={track.id}
                    >
                      <td className="px-4 py-3 text-white/60">{index + 1}</td>
                      <td>
                        <button
                          className="w-full cursor-pointer truncate px-4 py-3 text-left"
                          onClick={() => {
                            if (selectedTrackId !== track.id) {
                              setSelectedTrackId(track.id);
                              return;
                            }

                            void playerRef.current?.play();
                          }}
                          type="button"
                        >
                          {track.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {track.format}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/60">
                        {formatDuration(track.duration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTrack && (
            <audio
              autoPlay
              controls
              key={selectedTrack.id}
              ref={playerRef}
              src={selectedTrack.url}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
