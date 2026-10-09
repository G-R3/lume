import { DotsThreeIcon, LockSimpleIcon, MinusCircleIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Track } from "../../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { useMusicLibrary } from "@/hooks/use-music-library";
import type { QueueItem, QueueLane } from "@/lib/queue/model";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

export const QUEUE_SIDEBAR_WIDTH = "20.25rem";

export function QueueSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const playback = usePlayback();
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

  const queue = playback.queue;

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
    playback.removeQueueItem(queueItemId);

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
      className="border-default md:absolute! md:h-auto!"
      id="queue-sidebar"
      inert={!open}
      onOpenChange={onOpenChange}
      open={open}
      role="complementary"
      side="right"
      style={{ "--sidebar-width": QUEUE_SIDEBAR_WIDTH } as CSSProperties}
    >
      {window.lume.isMac && <div aria-hidden="true" className="h-9 shrink-0" />}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 scrollbar-thin">
        <div
          className={cn(
            "flex items-center justify-between",
            window.lume.isMac ? "pt-6" : "pt-18.5",
          )}
        >
          <h2 className="pl-2 text-sm font-semibold tracking-wide">Queue</h2>
          <Button
            aria-label="Close queue sidebar"
            className="md:hidden"
            onClick={() => onOpenChange(false)}
            size="icon"
            type="button"
            variant="toolbar"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        {playback.errorMessage && (
          <p className="mt-3 pl-2 text-xs text-danger">{playback.errorMessage}</p>
        )}
        {!queue ? (
          <p className="mt-6 pl-2 text-xs text-tertiary">Play a track to start a queue.</p>
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
                  playing={playback.isPlaying}
                  track={tracksById.get(queue.current.item.trackId)}
                />
              ) : (
                <p className="mt-2 pl-2 text-xs text-tertiary">
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
                  <p className="mt-1 pl-2 text-[11px] text-tertiary">
                    Playlist deleted; queue continues.
                  </p>
                )}
                {lane.items.length === 0 ? (
                  <p className="mt-2 pl-2 text-xs text-tertiary">Nothing up next.</p>
                ) : (
                  <>
                    <div className="mt-1">
                      {lane.items.slice(0, visibleCounts[lane.name]).map((item, index) => (
                        <div
                          className="group/queue-row relative rounded-lg hover:bg-raised focus-within:bg-raised focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus"
                          key={item.queueItemId}
                        >
                          <QueueTrack
                            item={item}
                            onJump={() => {
                              playback.jumpToQueueItem(item.queueItemId);
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
                        className="mt-2 ml-2 rounded-md py-1 text-xs text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
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
          className={cn("size-8 shrink-0 rounded-md", unavailable && "grayscale opacity-40")}
        />
      ) : (
        <span className="size-8 shrink-0 rounded-md bg-selected" />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-xs font-medium",
            playing && "text-accent",
            unavailable && "text-tertiary",
          )}
        >
          {title}
        </span>
        <span className="block truncate text-[11px] leading-4 text-secondary">
          {paused && "Paused · "}
          {unavailable ? "Unavailable" : track.artists.join(", ") || "Unknown artist"}
        </span>
      </span>
      {unavailable && (
        <LockSimpleIcon aria-hidden="true" className="shrink-0 text-disabled" size={13} />
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
            className="absolute top-3 right-2 text-tertiary opacity-0 group-focus-within/queue-row:opacity-100 group-hover/queue-row:opacity-100 data-popup-open:opacity-100 focus-visible:opacity-100"
            onMouseDown={(event) => event.preventDefault()}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <DotsThreeIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRemove} variant="danger">
          <MinusCircleIcon aria-hidden="true" />
          Remove from queue
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
