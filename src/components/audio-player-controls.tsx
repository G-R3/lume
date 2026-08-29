import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAudioPlayer, useAudioPlayerTime } from "@/hooks/use-audio-player";
import { formatDuration } from "@/lib/format-duration";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";

export function AudioPlayerControls() {
  const audioPlayer = useAudioPlayer();

  if (!audioPlayer.activeTrack) return null;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 grid min-h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 border-t border-neutral-800 bg-black/95 px-4 py-3 text-neutral-50 shadow-2xl backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-sm bg-linear-to-br from-orange-950 to-orange-500 text-xs font-semibold tracking-tight text-neutral-100"
        >
          {audioPlayer.activeTrack.name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {audioPlayer.activeTrack.name}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {audioPlayer.activeTrack.format}
          </p>
        </div>
      </div>

      <div className="w-[clamp(16rem,38vw,28rem)]">
        <div className="flex items-center justify-center gap-4">
          <button
            aria-label="Previous track"
            className="grid size-8 cursor-pointer place-items-center"
            onClick={audioPlayer.previous}
            type="button"
          >
            <SkipBackIcon aria-hidden="true" size={18} weight="fill" />
          </button>
          <button
            aria-label={audioPlayer.isPlaying ? "Pause" : "Play"}
            className="cursor-pointer grid size-9 place-items-center rounded-full bg-neutral-50 text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            onClick={audioPlayer.isPlaying ? audioPlayer.pause : audioPlayer.resume}
          >
            {audioPlayer.isPlaying ? (
              <PauseIcon aria-hidden="true" size={17} weight="fill" />
            ) : (
              <PlayIcon aria-hidden="true" size={17} weight="fill" />
            )}
          </button>
          <button
            aria-label="Next track"
            className="cursor-pointer grid size-8 place-items-center disabled:text-neutral-600 disabled:cursor-not-allowed"
            disabled={!audioPlayer.canGoNext}
            onClick={audioPlayer.next}
            type="button"
          >
            <SkipForwardIcon aria-hidden="true" size={18} weight="fill" />
          </button>
        </div>

        <AudioPlayerProgress key={audioPlayer.activeTrack.id} />
      </div>

      <div className="flex items-center justify-end gap-3 text-neutral-400">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={audioPlayer.isMuted ? "Unmute audio" : "Mute audio"}
          className="cursor-pointer grid size-8 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-lime-300"
          type="button"
          onClick={audioPlayer.toggleMute}
        >
          {audioPlayer.isMuted ? (
            <SpeakerSlashIcon aria-hidden="true" className="size-4.5" />
          ) : (
            <SpeakerHighIcon aria-hidden="true" className="size-4.5" />
          )}
          <span className="sr-only">Toggle mute</span>
        </Button>
        <div
          aria-hidden="true"
          className="hidden h-0.5 w-20 bg-linear-to-r from-neutral-300 from-60% to-neutral-800 to-60% sm:block"
        />
      </div>
    </footer>
  );
}

function AudioPlayerProgress() {
  const audioPlayer = useAudioPlayer();
  const currentTime = useAudioPlayerTime();
  const labelId = useId();
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const displayedTime = Math.min(
    previewTime ?? currentTime,
    audioPlayer.duration,
  );
  const progress =
    audioPlayer.duration > 0 ? (displayedTime / audioPlayer.duration) * 100 : 0;
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
          className="cursor-pointer **:data-[slot=slider-range]:bg-neutral-100 **:data-[slot=slider-thumb]:size-2.5 **:data-[slot=slider-thumb]:border-neutral-950 **:data-[slot=slider-track]:h-0.5 **:data-[slot=slider-track]:bg-neutral-700"
          disabled={audioPlayer.duration <= 0}
          max={audioPlayer.duration > 0 ? audioPlayer.duration : 1}
          min={0}
          onPointerCancel={() => setPreviewTime(null)}
          onValueChange={setPreviewTime}
          onValueCommitted={(value) => {
            audioPlayer.seek(value);
            setPreviewTime(null);
          }}
          step={0.1}
          value={displayedTime}
        />
      </div>
      <span className="text-right text-[11px] text-neutral-400 tabular-nums">
        {formatDuration(audioPlayer.duration)}
      </span>
    </div>
  );
}
