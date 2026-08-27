import { useAudioPlayer } from "@/hooks/use-audio-player";
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

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 grid min-h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-white/15 bg-neutral-950/95 px-4 py-3 text-white shadow-[0_-12px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-sm bg-linear-to-br from-[#4d210d] to-[#e66c2c] text-xs font-semibold tracking-tight text-white/80"
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
          <p className="mt-0.5 text-xs text-white/45">
            {audioPlayer.activeTrack.format}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          aria-label="Previous track"
          className="grid size-8 place-items-center text-white/60"
          type="button"
        >
          <SkipBackIcon aria-hidden="true" size={18} weight="fill" />
        </button>
        <button
          aria-label={audioPlayer.isPlaying ? "Pause" : "Play"}
          className="grid size-9 place-items-center rounded-full bg-white text-black"
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
          className="grid size-8 place-items-center text-white/60"
          type="button"
        >
          <SkipForwardIcon aria-hidden="true" size={18} weight="fill" />
        </button>
      </div>

      <div className="flex items-center justify-end gap-3 text-white/55">
        <button
          aria-label={audioPlayer.isMuted ? "Unmute audio" : "Mute audio"}
          className="grid size-8 place-items-center"
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
          className="hidden h-0.5 w-20 bg-linear-to-r from-white/65 from-60% to-white/15 to-60% sm:block"
        />
      </div>
    </footer>
  );
}
