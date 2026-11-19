import { useSidebar } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

export function AppKeyboardShortcuts({ toggleQueue }: { toggleQueue: () => void }) {
  const playback = usePlayback();
  const sidebar = useSidebar();
  const openPlaylistCreation = usePlaylistCreation();

  useKeyboardShortcuts({
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
