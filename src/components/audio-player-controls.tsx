import { Slider } from "@base-ui/react/slider";
import {
  PauseIcon,
  PlayIcon,
  QueueIcon,
  ShuffleAngularIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Track } from "../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { usePlayback, usePlaybackTime } from "@/hooks/use-playback";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";

// waveform is just a fix texture. not decoded audio amplitudes
const waveform = [
  1, 1, 2, 2, 3, 3, 2, 3, 2, 3, 2, 2, 2, 2, 1, 2, 2, 3, 2, 2, 3, 2, 3, 3, 2, 2, 2, 2, 1, 2, 2, 2, 2,
  1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 3, 2, 3, 1, 2, 2, 1, 1, 1, 2, 2, 2, 3, 2, 3, 3, 3, 3,
  4, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 2, 3, 2, 2, 2, 2, 1,
];

export function AudioPlayerControls({
  queueOpen,
  toggleQueue,
}: {
  queueOpen: boolean;
  toggleQueue: () => void;
}) {
  const playback = usePlayback();
  const sidebar = useSidebar();

  return (
    <header
      aria-label="Player"
      className={cn(
        "@container/player flex h-12 w-full shrink-0 items-center gap-4 border-b border-separator bg-page px-4 pt-px [&_button]:motion-reduce:transition-none [&_button]:motion-reduce:active:not-data-disabled:scale-100",
        window.lume.isMac && "[-webkit-app-region:drag]",
      )}
      data-slot="player"
    >
      {(sidebar.isMobile || sidebar.state === "collapsed") && (
        <div aria-hidden="true" className="w-52 shrink-0" />
      )}
      <div
        className="flex shrink-0 items-center gap-1 @min-[984px]/player:w-50 [&_button]:[-webkit-app-region:no-drag]"
        data-slot="player-transport"
      >
        <Button
          aria-label="Shuffle"
          aria-pressed={playback.shuffleEnabled}
          className={cn(
            "relative",
            playback.shuffleEnabled &&
              "text-accent aria-pressed:bg-transparent aria-pressed:hover:not-data-disabled:bg-hover hover:not-data-disabled:text-accent focus-visible:text-accent",
          )}
          disabled={!playback.isInitialized || playback.queue === null}
          onClick={() => playback.setShuffleEnabled(!playback.shuffleEnabled)}
          size="icon"
          type="button"
          variant="toolbar"
        >
          <ShuffleAngularIcon aria-hidden="true" />
          {playback.shuffleEnabled && (
            <span
              aria-hidden="true"
              className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent"
            />
          )}
        </Button>
        <Button
          aria-label="Previous track"
          className="text-primary"
          disabled={!playback.activeTrack}
          onClick={playback.previous}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SkipBackIcon aria-hidden="true" weight="fill" />
        </Button>
        <Button
          aria-label={playback.isPlaying ? "Pause" : "Play"}
          className="rounded-full"
          disabled={!playback.activeTrack}
          onClick={playback.togglePlayback}
          size="icon"
          type="button"
          variant="primary"
        >
          {playback.isPlaying ? (
            <PauseIcon aria-hidden="true" weight="fill" />
          ) : (
            <PlayIcon aria-hidden="true" weight="fill" />
          )}
        </Button>
        <Button
          aria-label="Next track"
          className="text-primary"
          disabled={!playback.canGoNext}
          onClick={playback.next}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SkipForwardIcon aria-hidden="true" weight="fill" />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <PlayerDisplay />
      </div>
      <div
        className="flex shrink-0 items-center justify-end gap-1 pr-2 @min-[984px]/player:w-50 [&_button]:[-webkit-app-region:no-drag]"
        data-slot="player-utilities"
      >
        <Button
          aria-label={playback.isMuted ? "Unmute audio" : "Mute audio"}
          aria-pressed={playback.isMuted}
          onClick={playback.toggleMute}
          size="icon"
          type="button"
          variant="toolbar"
        >
          {playback.isMuted ? (
            <SpeakerSlashIcon aria-hidden="true" />
          ) : (
            <SpeakerHighIcon aria-hidden="true" />
          )}
        </Button>
        <Slider.Root
          aria-label="Volume"
          className="mr-2 hidden w-12 @min-[700px]/player:block [-webkit-app-region:no-drag]"
          data-slot="player-volume"
          format={{ style: "percent" }}
          largeStep={0.1}
          max={1}
          min={0}
          onValueChange={playback.setVolume}
          step={0.01}
          thumbAlignment="edge"
          value={playback.isMuted ? 0 : playback.volume}
        >
          <Slider.Control className="group/volume relative flex h-8 cursor-pointer touch-none items-center rounded-xs has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
            <Slider.Track className="relative h-0.5 w-full overflow-hidden rounded-xs bg-track">
              <Slider.Indicator className="h-full bg-inverse" />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Volume"
              className="absolute size-2 rounded-full bg-inverse opacity-0 group-hover/volume:opacity-100 group-has-focus-visible/volume:opacity-100 data-dragging:opacity-100 [&_input]:outline-none"
            />
          </Slider.Control>
        </Slider.Root>
        <Button
          aria-controls="queue-sidebar"
          aria-expanded={queueOpen}
          aria-label={queueOpen ? "Close queue sidebar" : "Open queue sidebar"}
          onClick={toggleQueue}
          size="icon"
          type="button"
          variant="toolbar"
        >
          <QueueIcon aria-hidden="true" weight={queueOpen ? "fill" : "regular"} />
        </Button>
        <span aria-hidden="true" className="hidden w-13 @min-[984px]/player:block" />
      </div>
    </header>
  );
}

function PlayerDisplay() {
  const playback = usePlayback();

  return (
    <div
      className="@container/display relative flex h-10 w-130 min-w-0 max-w-full items-center gap-2 rounded-lg bg-raised py-1 pr-3 pl-1 ring-1 ring-default ring-inset [-webkit-app-region:no-drag]"
      data-slot="player-display"
    >
      <div className="absolute inset-x-0 top-1 grid px-3 pl-1">
        <PlayerMetadata track={playback.activeTrack} />
      </div>
      <span aria-hidden="true" className="size-8 shrink-0" />
      <div className="min-w-0 flex-1 pt-4">
        <PlayerProgress key={playback.activeQueueItemId} />
      </div>
    </div>
  );
}

function PlayerMetadata({ track }: { track: Track | null }) {
  const artist = track?.artists.join(", ") || "Unknown artist";

  const format = track
    ? [
        track.format.toUpperCase(),
        track.sampleRate
          ? `${track.sampleRate / 1000}${track.bitsPerSample ? `/${track.bitsPerSample}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div className="flex min-w-0 items-start gap-2">
      {track ? (
        <TrackArtwork artworkUrl={track.artworkUrl} className="size-8 bg-selected" />
      ) : (
        <span
          className="block size-8 shrink-0 rounded-sm bg-selected"
          data-slot="player-idle-artwork"
        />
      )}
      <div className="flex h-4 min-w-0 flex-1 items-center gap-2 text-meta">
        <bdi
          className={cn("min-w-0 truncate", track ? "font-medium text-primary" : "text-secondary")}
          data-slot="player-title"
          title={track?.title}
        >
          {track?.title ?? "Double-click a track to play"}
        </bdi>
        {track && (
          <>
            <bdi
              className="min-w-24 flex-1 truncate text-left text-secondary"
              data-slot="player-artist"
              title={artist}
            >
              {artist}
            </bdi>
            <span
              className="hidden shrink-0 font-mono text-secondary @min-[900px]/player:block"
              data-slot="player-format"
              title={format ?? undefined}
            >
              {format}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerProgress() {
  const playback = usePlayback();
  const currentTime = usePlaybackTime();
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const displayedTime = Math.max(0, Math.min(previewTime ?? currentTime, playback.duration));

  const elapsed = !playback.activeTrack
    ? "--:--"
    : (playback.duration >= 3600 && displayedTime < 3600
        ? `0:${formatDuration(displayedTime).padStart(5, "0")}`
        : formatDuration(displayedTime)
      ).padStart(formatDuration(playback.duration).length, "0");

  const remaining =
    playback.activeTrack && playback.duration > 0
      ? `−${formatDuration(Math.max(0, playback.duration - displayedTime))}`
      : "--:--";

  return (
    <div className="group/progress flex h-4 min-w-0 items-center gap-2" data-slot="player-progress">
      <span
        className={cn(
          "shrink-0 font-mono text-meta tabular-nums group-has-data-dragging/progress:text-primary",
          !playback.activeTrack
            ? "text-disabled"
            : previewTime !== null
              ? "text-primary"
              : "text-secondary",
        )}
        data-slot="player-elapsed"
      >
        {elapsed}
      </span>
      {playback.activeTrack ? (
        <Slider.Root
          aria-label="Playback position in seconds"
          className="w-85 min-w-0 shrink @min-[504px]/display:shrink-0"
          data-slot="player-seek"
          disabled={playback.duration <= 0}
          largeStep={10}
          max={playback.duration > 0 ? playback.duration : 1}
          min={0}
          onPointerCancel={() => {
            setPreviewTime(null);
            setHoverProgress(null);
          }}
          onValueChange={setPreviewTime}
          onValueCommitted={(value) => {
            playback.seek(value);
            setPreviewTime(null);
            setHoverProgress(null);
          }}
          step={0.001}
          thumbAlignment="edge"
          value={displayedTime}
        >
          <Slider.Control
            className="group/seek relative -my-1 flex h-6 cursor-pointer touch-none items-center data-disabled:cursor-default data-disabled:opacity-disabled"
            onPointerDown={() => setHoverProgress(null)}
            onPointerLeave={() => setHoverProgress(null)}
            onPointerMove={(event) => {
              if (playback.duration <= 0) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              setHoverProgress(
                Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
              );
            }}
            onPointerUp={() => setHoverProgress(null)}
          >
            <Slider.Track className="relative h-3 w-full overflow-clip rounded-xs group-has-focus-visible/seek:outline-2 group-has-focus-visible/seek:outline-offset-2 group-has-focus-visible/seek:outline-focus">
              <PlayerWaveform
                hoverProgress={previewTime === null ? hoverProgress : null}
                progress={playback.duration > 0 ? displayedTime / playback.duration : 0}
              />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Playback position in seconds"
              className="absolute size-0 opacity-0 [&_input]:outline-none"
              onKeyDown={(event) => {
                if (playback.duration <= 0) return;

                const step = event.shiftKey ? 10 : 1;

                const value = {
                  ArrowRight: displayedTime + step,
                  ArrowUp: displayedTime + step,
                  ArrowLeft: displayedTime - step,
                  ArrowDown: displayedTime - step,
                  PageUp: displayedTime + 10,
                  PageDown: displayedTime - 10,
                  Home: 0,
                  End: playback.duration,
                }[event.key];

                if (value === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                playback.seek(Math.max(0, Math.min(value, playback.duration)));
                setPreviewTime(null);
                setHoverProgress(null);
              }}
            />
          </Slider.Control>
        </Slider.Root>
      ) : (
        <span
          className="relative h-3 w-85 min-w-0 shrink overflow-clip @min-[504px]/display:shrink-0"
          data-slot="player-idle-progress"
        >
          <PlayerWaveform hoverProgress={null} idle progress={0} />
        </span>
      )}
      <span
        className={cn(
          "shrink-0 font-mono text-meta tabular-nums",
          playback.activeTrack ? "text-secondary" : "text-disabled",
        )}
        data-slot="player-remaining"
      >
        {remaining}
      </span>
    </div>
  );
}

function PlayerWaveform({
  progress,
  hoverProgress,
  idle = false,
}: {
  progress: number;
  hoverProgress: number | null;
  idle?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId();
  const [width, setWidth] = useState(340);
  const columns = Math.max(0, Math.min(waveform.length, Math.floor(width / 4)));
  const playedEnd = Math.min(progress, hoverProgress ?? progress) * width;
  const hoverEnd = Math.max(progress, hoverProgress ?? progress) * width;

  useLayoutEffect(() => {
    const track = ref.current?.parentElement;

    if (!track) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });

    observer.observe(track);

    return () => observer.disconnect();
  }, []);

  return (
    <svg aria-hidden="true" className="absolute top-0 left-0" height="12" ref={ref} width="340">
      <defs>
        <clipPath id={`${id}-played`}>
          <rect height="12" width={playedEnd} />
        </clipPath>
        <clipPath id={`${id}-hover`}>
          <rect height="12" width={hoverEnd - playedEnd} x={playedEnd} />
        </clipPath>
        <clipPath id={`${id}-remaining`}>
          <rect height="12" width={Math.max(0, width - hoverEnd)} x={hoverEnd} />
        </clipPath>
        <g id={`${id}-dots`}>
          {waveform
            .slice(0, columns)
            .flatMap((level, column) =>
              Array.from({ length: idle ? 1 : level }, (_, row) => (
                <rect
                  height="2"
                  key={`${column}-${row}`}
                  rx="0.5"
                  width="2"
                  x={column * 4 + 1}
                  y={idle ? 5 : Math.floor((12 - (level * 3 - 1)) / 2) + row * 3}
                />
              )),
            )}
        </g>
      </defs>
      <use className="fill-accent" clipPath={`url(#${id}-played)`} href={`#${id}-dots`} />
      <use className="fill-accent/60" clipPath={`url(#${id}-hover)`} href={`#${id}-dots`} />
      <use className="fill-track" clipPath={`url(#${id}-remaining)`} href={`#${id}-dots`} />
    </svg>
  );
}
