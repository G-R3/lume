import { useMusicLibrary } from "@/hooks/use-music-library";
import { FolderSettings } from "@/pages/settings/folders";

export function SettingsPage() {
  const library = useMusicLibrary();

  return <FolderSettings library={library} />;
}
