import { useMusicLibrary } from "@/hooks/use-music-library";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackList } from "@/pages/tracks/track-list";

export function TracksPage() {
  const library = useMusicLibrary();

  return (
    <>
      <LibraryStatus library={library} />
      {library.tracks.length > 0 && <TrackList tracks={library.tracks} />}
    </>
  );
}
