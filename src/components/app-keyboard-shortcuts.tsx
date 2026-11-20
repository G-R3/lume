import { useSidebar } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useGlobalShortcuts } from "@/lib/keyboard-shortcuts";

export function AppKeyboardShortcuts({ toggleQueue }: { toggleQueue: () => void }) {
  const playback = usePlayback();
  const sidebar = useSidebar();
  const openPlaylistCreation = usePlaylistCreation();

  useGlobalShortcuts({
    togglePlayback: playback.togglePlayback,
    nextTrack: playback.next,
    previousTrack: playback.previous,
    toggleSidebar: sidebar.toggleSidebar,
    newPlaylist: () => openPlaylistCreation({ target: null }),
    toggleMute: playback.toggleMute,
    toggleQueue,
  });

  return null;
}
