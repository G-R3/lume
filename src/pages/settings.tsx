import { useMusicLibrary } from "@/hooks/use-music-library";
import { SourceSettings } from "@/pages/settings/sources";

export function SettingsPage() {
  const library = useMusicLibrary();

  return <SourceSettings library={library} />;
}
