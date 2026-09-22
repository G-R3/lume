import { useMusicLibrary } from "@/hooks/use-music-library";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackCollectionHeader } from "@/pages/tracks/track-collection-header";
import { TrackList } from "@/pages/tracks/track-list";

export function TracksPage() {
  const library = useMusicLibrary();
  const items = library.tracks.map((track) => ({ queueItemId: track.id, track }));

  return (
    <main>
      <TrackCollectionHeader items={items} title="All Tracks" />
      <LibraryStatus library={library} />
      {library.tracks.length > 0 && <TrackList caption="All tracks" items={items} />}
    </main>
  );
}
