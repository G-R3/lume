import { useSidebar } from "@/components/ui/sidebar";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

export function AppKeyboardShortcuts() {
  const audioPlayer = useAudioPlayer();
  const sidebar = useSidebar();

  useKeyboardShortcuts(
    [
      {
        name: "Toggle playback",
        key: " ",
        action: audioPlayer.togglePlayback,
      },
      {
        name: "Next track",
        key: "ArrowRight",
        primary: true,
        action: audioPlayer.next,
      },
      {
        name: "Previous track",
        key: "ArrowLeft",
        primary: true,
        action: audioPlayer.previous,
      },
      {
        name: "Toggle sidebar",
        key: "b",
        primary: true,
        action: sidebar.toggleSidebar,
      },
    ],
    window.lume.isMac,
  );

  return null;
}
