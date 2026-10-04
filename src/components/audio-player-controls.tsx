import { Button } from "@/components/ui/button";
import { ArtworkFallback, TrackArtwork } from "@/components/track-artwork";
import { Slider } from "@/components/ui/slider";
import { usePlayback, usePlaybackTime } from "@/hooks/use-playback";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format-duration";
import { useSetTrackLiked } from "@/lib/library-query";
import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  ShuffleAngularIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

export function AudioPlayerControls() {
  const playback = usePlayback();
  const setTrackLiked = useSetTrackLiked();
  const activeTrack = playback.activeTrack;

  if (!activeTrack) return null;

  return (
    <footer className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 border-t border-neutral-800 bg-black/95 px-5 py-3 text-neutral-50 shadow-2xl backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <TrackArtwork
          artworkUrl={activeTrack.artworkUrl}
          className="size-12 rounded-sm text-xs"
          fallback={<ArtworkFallback track={activeTrack} />}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 max-w-48 flex-1">
            <p className="truncate text-sm font-medium">{activeTrack.title}</p>
            <p className="mt-0.5 truncate text-xs text-neutral-400">
              {activeTrack.artists.join(", ") || "Unknown artist"}
            </p>
          </div>
          <Button
            aria-label={
              activeTrack.likedAt === null
                ? `Like ${activeTrack.title}`
                : `Unlike ${activeTrack.title}`
            }
            aria-pressed={activeTrack.likedAt !== null}
            className={
              activeTrack.likedAt === null
                ? "text-neutral-400 hover:text-neutral-100"
                : "text-lime-300 hover:text-lime-200"
            }
            onClick={() =>
              setTrackLiked.mutate({
                liked: activeTrack.likedAt === null,
                trackId: activeTrack.id,
              })
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            <HeartIcon
              aria-hidden="true"
              weight={activeTrack.likedAt === null ? "regular" : "fill"}
            />
          </Button>
        </div>
      </div>

      <div className="w-[clamp(16rem,38vw,28rem)]">
        <div className="relative mx-auto flex w-fit items-center gap-4">
          <Button
            aria-label="Shuffle"
            aria-pressed={playback.shuffleEnabled}
            className={cn(
              "absolute right-full mr-4 grid size-8 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-lime-300",
              playback.shuffleEnabled
                ? "text-lime-300 hover:text-lime-200"
                : "text-neutral-400 hover:text-neutral-100",
            )}
            disabled={!playback.isInitialized || playback.queue === null}
            onClick={() => playback.setShuffleEnabled(!playback.shuffleEnabled)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ShuffleAngularIcon aria-hidden="true" className="size-4.5" />
            {playback.shuffleEnabled && (
              <span
                aria-hidden="true"
                className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
              />
            )}
          </Button>
          <button
            aria-label="Previous track"
            className="grid size-8 cursor-pointer place-items-center"
            onClick={playback.previous}
            type="button"
          >
            <SkipBackIcon aria-hidden="true" size={18} weight="fill" />
          </button>
          <button
            aria-label={playback.isPlaying ? "Pause" : "Play"}
            className="cursor-pointer grid size-9 place-items-center rounded-full bg-neutral-50 text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            onClick={playback.togglePlayback}
          >
            {playback.isPlaying ? (
              <PauseIcon aria-hidden="true" size={17} weight="fill" />
            ) : (
              <PlayIcon aria-hidden="true" size={17} weight="fill" />
            )}
          </button>
          <button
            aria-label="Next track"
            className="cursor-pointer grid size-8 place-items-center disabled:text-neutral-600 disabled:cursor-not-allowed"
            disabled={!playback.canGoNext}
            onClick={playback.next}
            type="button"
          >
            <SkipForwardIcon aria-hidden="true" size={18} weight="fill" />
          </button>
        </div>

        <AudioPlayerProgress key={playback.activeQueueItemId} />
      </div>

      <div className="flex items-center justify-end gap-3 text-neutral-400">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={playback.isMuted ? "Unmute audio" : "Mute audio"}
          className="cursor-pointer grid size-8 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-lime-300"
          type="button"
          onClick={playback.toggleMute}
        >
          {playback.isMuted ? (
            <SpeakerSlashIcon aria-hidden="true" className="size-4.5" />
          ) : (
            <SpeakerHighIcon aria-hidden="true" className="size-4.5" />
          )}
          <span className="sr-only">Toggle mute</span>
        </Button>
        <Slider
          aria-label="Volume"
          format={{ style: "percent" }}
          className="audio-player-slider hidden w-20! cursor-pointer sm:block **:data-[slot=slider-thumb]:pointer-events-none **:data-[slot=slider-range]:bg-neutral-300 **:data-[slot=slider-thumb]:size-2.5 **:data-[slot=slider-thumb]:border-neutral-950 **:data-[slot=slider-track]:h-0.5 **:data-[slot=slider-track]:bg-neutral-800"
          min={0}
          max={1}
          step={0.01}
          largeStep={0.1}
          value={playback.isMuted ? 0 : playback.volume}
          onValueChange={playback.setVolume}
        />
      </div>
    </footer>
  );
}

function AudioPlayerProgress() {
  const playback = usePlayback();
  const currentTime = usePlaybackTime();
  const labelId = useId();
  const [previewTime, setPreviewTime] = useState<number | null>(null);

  const displayedTime = Math.min(previewTime ?? currentTime, playback.duration);
  const progress = playback.duration > 0 ? (displayedTime / playback.duration) * 100 : 0;
  const textureOffset = 8 - progress * 0.16;

  const textureMask = `linear-gradient(to right, transparent calc(${progress}% + ${textureOffset - 52}px), black calc(${progress}% + ${textureOffset - 18}px), black calc(${progress}% + ${textureOffset + 18}px), transparent calc(${progress}% + ${textureOffset + 52}px))`;

  return (
    <div className="mt-2 grid grid-cols-[2.25rem_minmax(8rem,1fr)_2.25rem] items-center gap-2">
      <span className="text-[11px] text-neutral-400 tabular-nums">
        {formatDuration(displayedTime)}
      </span>
      <span className="sr-only" id={labelId}>
        Playback position in seconds
      </span>
      <div className="audio-player-progress relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-2 top-1/2 h-5 -translate-y-1/2 opacity-0 transition-opacity duration-300 ease-out"
          data-slot="slider-texture"
          style={{
            maskImage: textureMask,
          }}
        />
        <Slider
          aria-labelledby={labelId}
          className="audio-player-slider cursor-pointer **:data-[slot=slider-range]:bg-neutral-100 **:data-[slot=slider-thumb]:pointer-events-none **:data-[slot=slider-thumb]:size-2.5 **:data-[slot=slider-thumb]:border-neutral-950 **:data-[slot=slider-track]:h-0.5 **:data-[slot=slider-track]:bg-neutral-700"
          disabled={playback.duration <= 0}
          max={playback.duration > 0 ? playback.duration : 1}
          min={0}
          onPointerCancel={() => setPreviewTime(null)}
          onValueChange={setPreviewTime}
          onValueCommitted={(value) => {
            playback.seek(value);
            setPreviewTime(null);
          }}
          step={0.1}
          value={displayedTime}
        />
      </div>
      <span className="text-right text-[11px] text-neutral-400 tabular-nums">
        {formatDuration(playback.duration)}
      </span>
    </div>
  );
}
