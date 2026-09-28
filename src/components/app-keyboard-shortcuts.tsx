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
        primary: true,
        action: playback.next,
      },
      {
        name: "Previous track",
        key: "ArrowLeft",
        primary: true,
        action: playback.previous,
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
