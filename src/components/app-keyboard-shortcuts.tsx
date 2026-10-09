import { useSidebar } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { getSidebarShortcut, useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

export function AppKeyboardShortcuts({ toggleQueue }: { toggleQueue: () => void }) {
  const playback = usePlayback();
  const sidebar = useSidebar();
  const sidebarShortcut = getSidebarShortcut(window.lume.isMac);

  useKeyboardShortcuts(
    [
      {
        name: "Toggle playback",
        key: " ",
        yieldToButtons: true,
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
        key: sidebarShortcut.key,
        commandOrControl: true,
        action: sidebar.toggleSidebar,
      },
      {
        name: "Toggle mute",
        key: "m",
        action: playback.toggleMute,
      },
      {
        name: "Toggle queue",
        key: "q",
        action: toggleQueue,
      },
    ],
    window.lume.isMac,
  );

  return null;
}
