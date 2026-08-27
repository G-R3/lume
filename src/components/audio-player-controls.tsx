import { Slider } from "@/components/ui/slider";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { formatDuration } from "@/lib/format-duration";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";

export function AudioPlayerControls() {
  const audioPlayer = useAudioPlayer();

  if (!audioPlayer.activeTrack) return null;

  const duration = audioPlayer.duration;
  const displayedTime = Math.min(
    audioPlayer.scrubTime ?? audioPlayer.currentTime,
    duration,
  );

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 grid min-h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 text-neutral-50 shadow-2xl backdrop-blur-sm">
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

      <div>
        <div className="flex items-center gap-4">
          <button
            aria-label="Previous track"
            className="grid size-8 place-items-center disabled:text-neutral-600"
            disabled
            type="button"
          >
            <SkipBackIcon aria-hidden="true" size={18} weight="fill" />
          </button>
          <button
            aria-label={audioPlayer.isPlaying ? "Pause" : "Play"}
            className="grid size-9 place-items-center rounded-full bg-neutral-50 text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            onClick={() => {
              if (audioPlayer.isPlaying) {
                audioPlayer.pause();
              } else {
                audioPlayer.play();
              }
            }}
          >
            {audioPlayer.isPlaying ? (
              <PauseIcon aria-hidden="true" size={17} weight="fill" />
            ) : (
              <PlayIcon aria-hidden="true" size={17} weight="fill" />
            )}
          </button>
          <button
            aria-label="Next track"
            className="grid size-8 place-items-center disabled:text-neutral-600"
            disabled
            type="button"
          >
            <SkipForwardIcon aria-hidden="true" size={18} weight="fill" />
          </button>
        </div>

        <div>
          <span>
            {formatDuration(displayedTime)}
          </span>
          <span className="sr-only" id="playback-position-label">
            Playback position in seconds
          </span>
          <Slider
            aria-labelledby="playback-position-label"
            disabled={duration <= 0}
            max={duration > 0 ? duration : 1}
            min={0}
            onValueChange={(value) => {
              audioPlayer.setScrubTime(value);
            }}
            onValueCommitted={(value) => {
              audioPlayer.seek(value);
            }}
            step={0.1}
            value={displayedTime}
          />
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 text-neutral-400">
        <button
          aria-label={audioPlayer.isMuted ? "Unmute audio" : "Mute audio"}
          className="grid size-8 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-lime-300"
          type="button"
          onClick={() => audioPlayer.toggleMute()}
        >
          {audioPlayer.isMuted ? (
            <SpeakerSlashIcon aria-hidden="true" size={18} />
          ) : (
            <SpeakerHighIcon aria-hidden="true" size={18} />
          )}
        </button>
        <div
          aria-hidden="true"
          className="hidden h-0.5 w-20 bg-linear-to-r from-neutral-300 from-60% to-neutral-800 to-60% sm:block"
        />
      </div>
    </footer>
  );
}
