import { ArrowCounterClockwiseIcon, DotsThreeIcon, MinusCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, type Ref, useMemo, useRef } from "react";
import type { Track } from "../../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  type SidebarStyle,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePlayback } from "@/hooks/use-playback";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { formatDuration, formatTotalDuration } from "@/lib/format-duration";
import type { QueueItem, QueueLane } from "@/lib/queue/model";
import { showTruncatedText } from "@/lib/show-truncated-text";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 50;

const QUEUE_SIDEBAR_WIDTH = "20rem";

export function QueueSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const style: SidebarStyle = { "--sidebar-width": QUEUE_SIDEBAR_WIDTH };

  return (
    <Sidebar
      aria-label="Playback queue"
      aria-hidden={!open}
      className="border-separator bg-raised surface-raised md:absolute! md:h-auto!"
      id="queue-sidebar"
      inert={!open}
      onOpenChange={onOpenChange}
      open={open}
      role="complementary"
      side="right"
      style={style}
    >
      {open && <QueuePanel />}
    </Sidebar>
  );
}

function QueuePanel() {
  const playback = usePlayback();
  const library = useMusicLibrary();
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

  const finished = queue?.status === "stopped" && !queue.current;

  const lanes = [
    { name: "manual" as const, title: "Next in queue", items: queue?.manualQueue ?? [] },
    { name: "source" as const, title: `Next from ${sourceName}`, items: queue?.sourceQueue ?? [] },
  ].filter((lane) => lane.items.length > 0 || (lane.name === "source" && !finished));

  const queuedItems = queue
    ? [...(queue.current ? [queue.current.item] : []), ...queue.manualQueue, ...queue.sourceQueue]
    : [];

  const queuedDuration = queuedItems.reduce(
    (total, item) => total + (tracksById.get(item.trackId)?.duration ?? 0),
    0,
  );

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

  return (
    <>
      <SidebarHeader className="h-14 shrink-0 flex-row items-center gap-2 p-0 pr-2 pl-4">
        <h2 className="text-title font-semibold text-primary">Queue</h2>
        <p className="min-w-0 flex-1 truncate text-meta text-secondary">
          {queuedItems.length > 0 &&
            `${queuedItems.length.toLocaleString()} ${queuedItems.length === 1 ? "track" : "tracks"} · ${formatTotalDuration(queuedDuration)}`}
        </p>
      </SidebarHeader>
      <SidebarContent className="gap-4 pb-2" onPointerOver={showTruncatedText}>
        {playback.errorMessage && (
          <p className="px-4 text-meta text-danger">{playback.errorMessage}</p>
        )}
        {!queue ? (
          <div className="flex flex-col gap-1 px-4 py-2">
            <p className="text-body font-medium text-primary">Nothing queued</p>
            <p className="text-meta text-secondary">Double-click a track to play it.</p>
          </div>
        ) : (
          <>
            <SidebarGroup className="px-3 py-0">
              <QueueSectionHeading headingRef={currentHeading} id="queue-current">
                Now playing
              </QueueSectionHeading>
              {queue.current ? (
                <div
                  className="flex h-10 items-center gap-2 rounded-lg px-1"
                  data-slot="queue-current"
                >
                  <QueueTrack
                    item={queue.current.item}
                    state={playback.isPlaying ? "playing" : "paused"}
                    track={tracksById.get(queue.current.item.trackId)}
                  />
                </div>
              ) : finished ? (
                <div className="flex h-10 items-center gap-2 px-1" data-slot="queue-finished">
                  <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-overlay">
                    <ArrowCounterClockwiseIcon
                      aria-hidden="true"
                      className="size-4 text-secondary"
                    />
                  </span>
                  <p
                    className="min-w-0 flex-1 truncate text-body font-medium text-primary"
                    data-truncate
                  >
                    End of {sourceName}
                  </p>
                </div>
              ) : (
                <p className="px-1 text-meta text-secondary">Nothing playing</p>
              )}
            </SidebarGroup>

            {lanes.map((lane) => (
              <SidebarGroup className="px-3 py-0" key={lane.name}>
                <QueueSectionHeading
                  count={lane.items.length}
                  headingRef={(element) => {
                    laneHeadings.current[lane.name] = element;
                  }}
                  id={`queue-${lane.name}`}
                >
                  {lane.title}
                </QueueSectionHeading>
                {lane.name === "source" && queue.source.kind === "detached" && (
                  <p className="px-1 pb-2 text-meta text-secondary">Playlist deleted</p>
                )}
                {lane.items.length === 0 ? (
                  <p className="px-1 text-meta text-secondary">Nothing up next</p>
                ) : (
                  <>
                    <SidebarMenu>
                      {lane.items.slice(0, VISIBLE_ROWS).map((item, index) => (
                        <QueueRow
                          item={item}
                          key={item.queueItemId}
                          onJump={() => {
                            playback.jumpToQueueItem(item.queueItemId);
                            requestAnimationFrame(() => currentHeading.current?.focus());
                          }}
                          onRemove={() => remove(item.queueItemId, lane.items, index, lane.name)}
                          playRef={(element) => {
                            if (element) playButtons.current.set(item.queueItemId, element);
                            else playButtons.current.delete(item.queueItemId);
                          }}
                          track={tracksById.get(item.trackId)}
                        />
                      ))}
                    </SidebarMenu>
                    {lane.items.length > VISIBLE_ROWS && (
                      <p className="flex h-8 items-center px-1 text-meta text-secondary">
                        {(lane.items.length - VISIBLE_ROWS).toLocaleString()} more
                      </p>
                    )}
                  </>
                )}
              </SidebarGroup>
            ))}
          </>
        )}
      </SidebarContent>
    </>
  );
}

function QueueSectionHeading({
  children,
  count,
  headingRef,
  id,
}: {
  children: ReactNode;
  count?: number;
  headingRef: Ref<HTMLHeadingElement>;
  id: string;
}) {
  return (
    <div className="flex items-center gap-2 pr-1">
      <SidebarGroupLabel
        className="min-w-0 flex-1 px-1"
        id={id}
        render={<h3 ref={headingRef} />}
        tabIndex={-1}
      >
        <span className="truncate" data-truncate>
          {children}
        </span>
      </SidebarGroupLabel>
      {count !== undefined && count > 0 && (
        <span className="font-mono text-meta text-secondary tabular-nums">
          {count.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function QueueRow({
  item,
  onJump,
  onRemove,
  playRef,
  track,
}: {
  item: QueueItem;
  onJump: () => void;
  onRemove: () => void;
  playRef: (element: HTMLButtonElement | null) => void;
  track?: Track;
}) {
  const title = track?.title ?? `Track ${item.trackId}`;
  const unavailable = !track?.available;

  return (
    <SidebarMenuItem className="rounded-lg hover:bg-hover">
      <button
        aria-disabled={unavailable}
        aria-label={unavailable ? `${title} unavailable` : `Play ${title} now`}
        className="flex h-10 w-full items-center gap-2 rounded-lg px-1 text-left focus-visible:-outline-offset-2"
        onClick={unavailable ? undefined : onJump}
        ref={playRef}
        type="button"
      >
        <QueueTrack item={item} track={track} />
        <span
          className={cn(
            "min-w-10 shrink-0 text-right font-mono text-meta tabular-nums group-hover/menu-item:invisible group-has-focus-visible/menu-item:invisible group-has-data-popup-open/menu-item:invisible",
            unavailable ? "text-disabled" : "text-secondary",
          )}
          data-slot="queue-time"
        >
          {track && formatDuration(track.duration)}
        </span>
      </button>
      <QueueRowMenu onRemove={onRemove} title={title} />
    </SidebarMenuItem>
  );
}

function QueueTrack({
  item,
  state,
  track,
}: {
  item: QueueItem;
  state?: "paused" | "playing";
  track?: Track;
}) {
  const unavailable = !track?.available;

  return (
    <>
      <TrackArtwork
        artworkUrl={track?.artworkUrl ?? null}
        className={cn("size-8", unavailable && "opacity-disabled")}
        state={state}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-left text-body font-medium",
            unavailable ? "text-disabled" : state ? "text-accent" : "text-primary",
          )}
          data-truncate
          dir="auto"
        >
          {track?.title ?? `Track ${item.trackId}`}
        </span>
        <span
          className={cn(
            "block truncate text-left text-meta",
            unavailable ? "text-disabled" : "text-secondary",
          )}
          data-truncate
          dir="auto"
        >
          {track?.artists.join(", ") || "Unknown artist"}
        </span>
      </span>
      {unavailable && <span className="shrink-0 text-meta text-secondary">Unavailable</span>}
    </>
  );
}

function QueueRowMenu({ onRemove, title }: { onRemove: () => void; title: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`More options for ${title}`}
            className="absolute top-2 right-1 opacity-0 group-hover/menu-item:opacity-100 group-has-focus-visible/menu-item:opacity-100 data-popup-open:opacity-100"
            onMouseDown={(event) => event.preventDefault()}
            size="icon-sm"
            static
            variant="row-action"
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
