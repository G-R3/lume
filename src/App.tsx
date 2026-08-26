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

function App() {
  const [_library, setLibrary] = useState<MusicLibrary | null>(null);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [_errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseMusicFolder = async () => {
    setIsLoadingLibrary(true);

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
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Music Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuButton>All tracks</SidebarMenuButton>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <main className="">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />

          <h1 className="text-xl font-semibold tracking-tight">
            Hello, world!
          </h1>
          <Button
            disabled={isLoadingLibrary}
            onClick={chooseMusicFolder}
            type="button"
          >
            {isLoadingLibrary
              ? "Loading Music Folder..."
              : "Choose Music Folder"}
          </Button>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
