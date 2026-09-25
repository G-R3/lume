import { DotsThreeIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Track } from "../../../shared/lib";
import { ArtworkFallback, TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "@/components/ui/sidebar";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMusicLibrary } from "@/hooks/use-music-library";
import type { QueueItem, QueueLane } from "@/lib/queue";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

export function QueueSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const audioPlayer = useAudioPlayer();
  const library = useMusicLibrary();
  const [visibleCounts, setVisibleCounts] = useState({ manual: PAGE_SIZE, source: PAGE_SIZE });
  const playButtons = useRef(new Map<string, HTMLButtonElement>());

  const laneHeadings = useRef<Record<QueueLane, HTMLHeadingElement | null>>({
    manual: null,
    source: null,
  });

  const currentHeading = useRef<HTMLHeadingElement>(null);

  const tracksById = useMemo(
    () => new Map(library.tracks.map((track) => [track.id, track])),
    [library],
  );

  const queue = audioPlayer.queue;

  const sourceName =
    queue?.source.kind === "all-tracks" ? "All tracks" : (queue?.source.title ?? "source");

  const lanes = [
    { name: "manual" as const, title: "Next in queue", items: queue?.manualQueue ?? [] },
    { name: "source" as const, title: `Next from ${sourceName}`, items: queue?.sourceQueue ?? [] },
  ].filter((lane) => lane.name === "source" || lane.items.length > 0);

  const remove = (
    queueItemId: string,
    items: readonly QueueItem[],
    index: number,
    lane: QueueLane,
  ) => {
    const nextId = items[index + 1]?.queueItemId ?? items[index - 1]?.queueItemId;
    audioPlayer.dispatchQueue({ type: "removeQueueItem", queueItemId });

    requestAnimationFrame(() => {
      const target = nextId ? playButtons.current.get(nextId) : null;
      (target ?? laneHeadings.current[lane] ?? laneHeadings.current.source)?.focus();
    });
  };

  // SAFETY: React accepts CSS custom properties in the style object.
  return (
    <Sidebar
      aria-label="Playback queue"
      aria-hidden={!open}
      className="border-neutral-800 md:absolute! md:h-auto!"
      id="queue-sidebar"
      inert={!open}
      onOpenChange={onOpenChange}
      open={open}
      role="complementary"
      side="right"
      style={{ "--sidebar-width": "20.25rem" } as CSSProperties}
    >
      {window.lume.isMac && (
        <div aria-hidden="true" className="h-9 shrink-0 [-webkit-app-region:drag]" />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 [scrollbar-width:thin]">
        <div
          className={cn(
            "flex items-center justify-between",
            window.lume.isMac ? "pt-6" : "pt-[4.625rem]",
          )}
        >
          <h2 className="pl-2 text-sm font-semibold tracking-wide">Queue</h2>
          <Button
            aria-label="Close queue sidebar"
            className="text-neutral-400 md:hidden"
            onClick={() => onOpenChange(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        {audioPlayer.errorMessage && (
          <p className="mt-3 pl-2 text-xs text-red-300">{audioPlayer.errorMessage}</p>
        )}
        {!queue ? (
          <p className="mt-6 pl-2 text-xs text-neutral-500">Play a track to start a queue.</p>
        ) : (
          <>
            <section aria-labelledby="queue-current" className="mt-5">
              <h3
                className="pl-2 text-xs font-semibold"
                id="queue-current"
                ref={currentHeading}
                tabIndex={-1}
              >
                Now playing
              </h3>
              {queue.current ? (
                <QueueTrack
                  current
                  item={queue.current.item}
                  paused={queue.status === "paused"}
                  playing={audioPlayer.isPlaying}
                  track={tracksById.get(queue.current.item.trackId)}
                />
              ) : (
                <p className="mt-2 pl-2 text-xs text-neutral-500">
                  {queue.status === "stopped" ? "Playback finished." : "Nothing playing."}
                </p>
              )}
            </section>

            {lanes.map((lane) => (
              <section aria-labelledby={`queue-${lane.name}`} className="mt-5" key={lane.name}>
                <h3
                  className="truncate pl-2 text-xs font-semibold"
                  id={`queue-${lane.name}`}
                  ref={(element) => {
                    laneHeadings.current[lane.name] = element;
                  }}
                  tabIndex={-1}
                >
                  {lane.title}
                </h3>
                {lane.name === "source" && queue.source.kind === "detached" && (
                  <p className="mt-1 pl-2 text-[11px] text-neutral-500">
                    Playlist deleted; queue continues.
                  </p>
                )}
                {lane.items.length === 0 ? (
                  <p className="mt-2 pl-2 text-xs text-neutral-500">Nothing up next.</p>
                ) : (
                  <>
                    <div className="mt-1">
                      {lane.items.slice(0, visibleCounts[lane.name]).map((item, index) => (
                        <div
                          className="group/queue-row relative rounded-[calc(var(--radius-sm)+2px)] hover:bg-sidebar-accent focus-within:bg-sidebar-accent focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                          key={item.queueItemId}
                        >
                          <QueueTrack
                            item={item}
                            onJump={() => {
                              audioPlayer.dispatchQueue({
                                type: "jumpTo",
                                queueItemId: item.queueItemId,
                              });
                              requestAnimationFrame(() => currentHeading.current?.focus());
                            }}
                            playRef={(element) => {
                              if (element) playButtons.current.set(item.queueItemId, element);
                              else playButtons.current.delete(item.queueItemId);
                            }}
                            track={tracksById.get(item.trackId)}
                          />
                          <QueueRowMenu
                            item={item}
                            onRemove={() => remove(item.queueItemId, lane.items, index, lane.name)}
                            track={tracksById.get(item.trackId)}
                          />
                        </div>
                      ))}
                    </div>
                    {lane.items.length > visibleCounts[lane.name] && (
                      <button
                        className="mt-2 ml-2 rounded-sm py-1 text-xs text-neutral-400 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-lime-300"
                        onClick={() =>
                          setVisibleCounts((counts) => ({
                            ...counts,
                            [lane.name]: counts[lane.name] + PAGE_SIZE,
                          }))
                        }
                        type="button"
                      >
                        Show more ({(lane.items.length - visibleCounts[lane.name]).toLocaleString()}{" "}
                        left)
                      </button>
                    )}
                  </>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </Sidebar>
  );
}

function QueueTrack({
  current = false,
  item,
  onJump,
  paused = false,
  playRef,
  playing = false,
  track,
}: {
  current?: boolean;
  item: QueueItem;
  onJump?: () => void;
  paused?: boolean;
  playRef?: (element: HTMLButtonElement | null) => void;
  playing?: boolean;
  track?: Track;
}) {
  const title = track?.title ?? `Track ${item.trackId}`;
  const unavailable = !track?.available;

  const content = (
    <>
      {track ? (
        <TrackArtwork
          artworkUrl={track.artworkUrl}
          className={cn(
            "size-8 shrink-0 rounded-sm text-[8px]",
            unavailable && "grayscale opacity-40",
          )}
          fallback={<ArtworkFallback track={track} />}
        />
      ) : (
        <span className="size-8 shrink-0 rounded-sm bg-neutral-800" />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-xs font-medium",
            playing && "text-lime-300",
            unavailable && "text-neutral-500",
          )}
        >
          {title}
        </span>
        <span className="block truncate text-[11px] leading-4 text-neutral-400">
          {paused && "Paused · "}
          {unavailable ? "Unavailable" : track.artists.join(", ") || "Unknown artist"}
        </span>
      </span>
      {unavailable && (
        <LockSimpleIcon aria-hidden="true" className="shrink-0 text-neutral-600" size={13} />
      )}
    </>
  );

  if (current) return <div className="mt-1 flex min-h-12 items-center gap-2.5 pl-2">{content}</div>;

  return (
    <button
      aria-disabled={unavailable}
      aria-label={unavailable ? `${title} unavailable` : `Play ${title} now`}
      className="flex min-h-12 w-full items-center gap-2.5 pr-10 pl-2 text-left outline-none aria-disabled:cursor-not-allowed"
      onClick={unavailable ? undefined : onJump}
      ref={playRef}
      type="button"
    >
      {content}
    </button>
  );
}

function QueueRowMenu({
  item,
  onRemove,
  track,
}: {
  item: QueueItem;
  onRemove: () => void;
  track?: Track;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Queue options for ${track?.title ?? `track ${item.trackId}`}`}
            className="absolute top-3 right-2 text-neutral-500 opacity-0 group-focus-within/queue-row:opacity-100 group-hover/queue-row:opacity-100 data-popup-open:opacity-100 focus-visible:opacity-100"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <DotsThreeIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onRemove} variant="destructive">
          Remove from queue
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
