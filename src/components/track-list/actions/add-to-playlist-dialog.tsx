import {
  ArrowDownIcon,
  ArrowElbowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CommandIcon,
} from "@phosphor-icons/react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useState } from "react";
import type { PlaylistSummary } from "../../../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Dialog, DialogDescription, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { SelectionShortcutKeys } from "@/components/track-list/selection/selection-shortcut-keys";
import type { ActionTarget } from "@/components/track-list/selection/track-selection";

type PaletteItem =
  | { kind: "create" }
  | { kind: "queue" }
  | { kind: "playlist"; playlist: PlaylistSummary };

type PaletteGroup = { items: PaletteItem[]; value: "playlists" | "queue" };

const createItem: PaletteItem = { kind: "create" };

const queueItem: PaletteItem = { kind: "queue" };

const queueGroup: PaletteGroup = { items: [queueItem], value: "queue" };

const queueLabel = "Add to queue";

function matchesQuery(item: PaletteItem, query: string) {
  const needle = query.trim().toLowerCase();

  switch (item.kind) {
    case "create":
      return true;
    case "queue":
      return queueLabel.toLowerCase().includes(needle);
    case "playlist":
      return item.playlist.title.toLowerCase().includes(needle);
  }
}

type AddToPlaylistDialogProps = {
  error: string | null;
  finalFocus: DialogPrimitive.Popup.Props["finalFocus"];
  onAddToQueue: (() => void) | null;
  onCreatePlaylist: () => void;
  onDismiss: () => void;
  onExited: () => void;
  onPick: (playlist: PlaylistSummary) => void;
  open: boolean;
  target: ActionTarget;
};

export function AddToPlaylistDialog({
  error,
  finalFocus,
  onAddToQueue,
  onCreatePlaylist,
  onDismiss,
  onExited,
  onPick,
  open,
  target,
}: AddToPlaylistDialogProps) {
  const library = useMusicLibrary();
  const [highlighted, setHighlighted] = useState<PaletteItem | undefined>();
  const [search, setSearch] = useState("");
  const count = target.entries.length;
  const targetLabel = count === 1 ? target.entries[0].title : `${count.toLocaleString()} tracks`;

  const playlistItems = library.playlists.map(
    (playlist): PaletteItem => ({ kind: "playlist", playlist }),
  );

  const playlistGroup: PaletteGroup = { items: [...playlistItems, createItem], value: "playlists" };

  // New playlist always matches, so a search that only finds the queue would otherwise highlight it.
  const queueLeads =
    search.trim() !== "" &&
    matchesQuery(queueItem, search) &&
    !playlistItems.some((item) => matchesQuery(item, search));

  const groups: PaletteGroup[] = !onAddToQueue
    ? [playlistGroup]
    : queueLeads
      ? [queueGroup, playlistGroup]
      : [playlistGroup, queueGroup];

  const handleSelect = (item: PaletteItem) => {
    switch (item.kind) {
      case "create":
        onCreatePlaylist();

        return;
      case "queue":
        onAddToQueue?.();

        return;
      case "playlist":
        onPick(item.playlist);
    }
  };

  const placeholder = onAddToQueue ? "Add to playlist or queue" : "Add to playlist";

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onExited();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay className="transition-none" />
        <DialogPrimitive.Popup
          className="fixed top-24 left-1/2 z-50 flex w-140 max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-clip rounded-xl bg-raised p-px surface-raised text-primary shadow-dialog inset-ring inset-ring-default outline-none"
          data-slot="palette"
          finalFocus={finalFocus}
        >
          <DialogTitle className="sr-only">Add to playlist</DialogTitle>
          <DialogDescription className="sr-only">
            {placeholder} for {targetLabel}.
          </DialogDescription>
          <Autocomplete.Root
            autoHighlight="always"
            filter={matchesQuery}
            inline
            itemToStringValue={(item: PaletteItem) =>
              item.kind === "playlist"
                ? item.playlist.title
                : item.kind === "queue"
                  ? queueLabel
                  : ""
            }
            items={groups}
            keepHighlight
            onItemHighlighted={(item: PaletteItem | undefined) => setHighlighted(item)}
            onValueChange={(value, details) => {
              if (details.reason === "input-change" || details.reason === "input-clear") {
                setSearch(value);
              }
            }}
            open
            value={search}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-separator px-4">
              <span className="flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-md bg-overlay pr-2 pl-1">
                <span className="flex shrink-0">
                  {target.entries.slice(0, 3).map((entry) => (
                    <TrackArtwork
                      artworkUrl={entry.artworkUrl}
                      className="h-4 w-3 rounded-xs not-first:-ml-1"
                      key={entry.sourceEntryId}
                    />
                  ))}
                </span>
                <span className="truncate text-meta text-primary">{targetLabel}</span>
              </span>
              <Autocomplete.Input
                aria-keyshortcuts={window.lume.isMac ? "Meta+Enter" : "Control+Enter"}
                aria-label="Find a playlist"
                className="h-full min-w-0 flex-1 bg-transparent text-title font-normal tracking-normal text-primary caret-accent outline-none placeholder:text-placeholder"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;

                  if (window.lume.isMac ? event.metaKey : event.ctrlKey) {
                    event.preventDefault();
                    handleSelect(createItem);
                  } else if (event.altKey && onAddToQueue) {
                    event.preventDefault();
                    handleSelect(queueItem);
                  }
                }}
                placeholder={placeholder}
              />
            </div>
            <Autocomplete.List className="flex max-h-[min(400px,50vh)] scroll-py-2 flex-col overflow-y-auto overscroll-contain p-2 scroll-area-scrollbar">
              {(group: PaletteGroup) => (
                <Autocomplete.Group items={group.items} key={group.value}>
                  <Autocomplete.GroupLabel className="flex h-8 items-center px-2 text-meta font-medium text-secondary">
                    {group.value === "playlists" ? "Playlists" : "Queue"}
                  </Autocomplete.GroupLabel>
                  <Autocomplete.Collection>
                    {(item: PaletteItem) => (
                      <PaletteRow
                        item={item}
                        targetCount={count}
                        key={item.kind === "playlist" ? item.playlist.id : item.kind}
                        onSelect={handleSelect}
                      />
                    )}
                  </Autocomplete.Collection>
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
            <FieldError className="px-4 pb-2">{error}</FieldError>
            <div className="flex h-10 shrink-0 items-center gap-4 rounded-b-[11px] border-t border-separator bg-inset px-4 font-mono text-meta text-secondary">
              <span className="flex items-center gap-1">
                <span className="flex">
                  <ArrowUpIcon aria-hidden="true" className="size-3" weight="bold" />
                  <ArrowDownIcon aria-hidden="true" className="-ml-0.5 size-3" weight="bold" />
                </span>
                move
              </span>
              <span className="flex items-center gap-1">
                <ArrowElbowDownLeftIcon aria-hidden="true" className="size-3" weight="bold" />
                {highlighted?.kind === "create" ? "create" : "add"}
              </span>
              {highlighted?.kind !== "create" && (
                <span className="flex items-center gap-1">
                  <CreateShortcut />
                  create
                </span>
              )}
              <span className="ml-auto">esc</span>
            </div>
          </Autocomplete.Root>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

function PaletteRow({
  item,
  onSelect,
  targetCount,
}: {
  item: PaletteItem;
  onSelect: (item: PaletteItem) => void;
  targetCount: number;
}) {
  const label =
    item.kind === "playlist"
      ? item.playlist.title
      : item.kind === "queue"
        ? queueLabel
        : targetCount === 1
          ? "New playlist with this track"
          : `New playlist from ${targetCount.toLocaleString()} tracks`;

  return (
    <Autocomplete.Item
      className="group/palette-row flex h-10 shrink-0 cursor-default items-center gap-3 rounded-sm px-2 text-body text-primary outline-none select-none data-highlighted:bg-hover data-highlighted:font-medium data-highlighted:[font-variation-settings:'opsz'_19.75]"
      onClick={() => onSelect(item)}
      value={item}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex min-w-24 shrink-0 items-center justify-end gap-2 font-mono whitespace-nowrap text-meta font-normal text-secondary tabular-nums">
        {item.kind === "playlist" && (
          <>
            <span className="group-data-highlighted/palette-row:hidden">
              {item.playlist.trackCount.toLocaleString()}
            </span>
            <span className="hidden items-center gap-1 group-data-highlighted/palette-row:flex">
              {item.playlist.trackCount.toLocaleString()}
              <ArrowRightIcon aria-hidden="true" className="size-3" />
              {(item.playlist.trackCount + targetCount).toLocaleString()}
            </span>
          </>
        )}
        <Kbd
          aria-hidden="true"
          className="hidden group-data-highlighted/palette-row:inline-flex"
          size="lg"
        >
          <ArrowElbowDownLeftIcon className="size-3" weight="bold" />
        </Kbd>
        {item.kind === "create" && (
          <Kbd aria-hidden="true" className="group-data-highlighted/palette-row:hidden" size="lg">
            <CreateShortcut />
          </Kbd>
        )}
        {item.kind === "queue" && (
          <Kbd aria-hidden="true" className="group-data-highlighted/palette-row:hidden" size="lg">
            <SelectionShortcutKeys action="queue" />
          </Kbd>
        )}
      </span>
    </Autocomplete.Item>
  );
}

function CreateShortcut() {
  return (
    <span aria-hidden="true" className={cn("flex items-center", !window.lume.isMac && "gap-1")}>
      {window.lume.isMac ? <CommandIcon className="size-3" weight="bold" /> : "Ctrl"}
      <ArrowElbowDownLeftIcon className="size-3" weight="bold" />
    </span>
  );
}
