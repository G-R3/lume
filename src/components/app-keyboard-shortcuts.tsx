import { useSidebar } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

export function AppKeyboardShortcuts() {
  const playback = usePlayback();
  const sidebar = useSidebar();

  useKeyboardShortcuts(
    [
      {
        name: "Toggle playback",
        key: " ",
        action: playback.togglePlayback,
      },
      {
        name: "Next track",
        key: "ArrowRight",
        commandOrControl: true,
        action: playback.next,
      },
      {
        name: "Previous track",
        key: "ArrowLeft",
        commandOrControl: true,
        action: playback.previous,
      },
      {
        name: "Toggle sidebar",
        key: "b",
        commandOrControl: true,
        action: sidebar.toggleSidebar,
      },
      {
        name: "Toggle mute",
        key: "m",
        action: playback.toggleMute,
      },
    ],
    window.lume.isMac,
  );

  return null;
}
