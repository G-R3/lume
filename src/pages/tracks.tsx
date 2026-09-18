import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { formatDuration } from "@/lib/format-duration";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackList } from "@/pages/tracks/track-list";
import { DotIcon, PlayIcon, ShuffleAngularIcon } from "@phosphor-icons/react";

export function TracksPage() {
  const library = useMusicLibrary();
  const audioPlayer = useAudioPlayer();

  const trackCount = library.tracks.length;
  const totalDuration = library.tracks.reduce((prev, curr) => (prev += curr.duration || 0), 0);

  const firstAvailableTrackIndex = library.tracks.findIndex((track) => track.available);
  const firstAvailableTrack = library.tracks[firstAvailableTrackIndex];
  const items = library.tracks.map((track) => ({ key: track.id, track }));

  return (
    <>
      <section className="flex items-end px-5 gap-5 my-6">
        <div className="size-64 bg-neutral-900 rounded-md outline-1 -outline-offset-1 outline-neutral-900/10 dark:outline-neutral-400/10" />
        <div className="flex flex-col justify-end gap-1">
          <h1 className="text-4xl">All Tracks</h1>
          <div className="flex items-center text-xs text-neutral-400">
            <span>{trackCount} tracks</span>
            <DotIcon className="size-6" />
            <span>{formatDuration(totalDuration)} duration</span>
          </div>

          <div className="flex gap-2">
            <Button
              className="self-start mt-1"
              size="lg"
              onClick={() => {
                if (!audioPlayer.isPlaying && !audioPlayer.activeTrack) {
                  audioPlayer.playFrom(items, firstAvailableTrackIndex);
                } else if (
                  audioPlayer.activeTrack &&
                  firstAvailableTrack.id !== audioPlayer.activeTrack.id
                ) {
                  audioPlayer.playFrom(items, firstAvailableTrackIndex);
                } else {
                  audioPlayer.seek(0);
                }
              }}
            >
              <PlayIcon className="size-3" />
              Play
            </Button>
            <Button
              className="self-start mt-1"
              size="lg"
              onClick={() => {
                if (!audioPlayer.isPlaying && !audioPlayer.activeTrack) {
                  audioPlayer.playFrom(items, firstAvailableTrackIndex);
                } else if (
                  audioPlayer.activeTrack &&
                  firstAvailableTrack.id !== audioPlayer.activeTrack.id
                ) {
                  audioPlayer.playFrom(items, firstAvailableTrackIndex);
                } else {
                  audioPlayer.seek(0);
                }
              }}
            >
              <ShuffleAngularIcon className="size-3.5" />
              Shuffle
            </Button>
          </div>
        </div>
      </section>
      <LibraryStatus library={library} />
      {library.tracks.length > 0 && <TrackList caption="All tracks" items={items} />}
    </>
  );
}
