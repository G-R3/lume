import {
  ArrowDownIcon,
  ArrowElbowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CommandIcon,
} from "@phosphor-icons/react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useRef, useState } from "react";
import type { PlaylistSummary } from "../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Dialog, DialogDescription, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useAddTracksToPlaylistMutation } from "@/lib/playlist-mutations";
import type { ActionTarget } from "@/pages/tracks/track-selection";

type PaletteItem = { kind: "create" } | { kind: "playlist"; playlist: PlaylistSummary };

type PaletteGroup = { items: PaletteItem[]; value: "actions" | "playlists" };

type DuplicateConfirmation = { alreadyInPlaylist: number; playlistId: number };

const createItem: PaletteItem = { kind: "create" };

type AddToPlaylistDialogProps = {
  finalFocus: DialogPrimitive.Popup.Props["finalFocus"];
  onCreatePlaylist: (target: ActionTarget) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target: ActionTarget;
};

export function AddToPlaylistDialog({
  finalFocus,
  onCreatePlaylist,
  onOpenChange,
  open,
  target,
}: AddToPlaylistDialogProps) {
  const library = useMusicLibrary();
  const addTracks = useAddTracksToPlaylistMutation();
  const [confirmation, setConfirmation] = useState<DuplicateConfirmation | null>(null);
  const [highlighted, setHighlighted] = useState<PaletteItem | undefined>();
  const [search, setSearch] = useState("");
  const isSubmittingRef = useRef(false);
  const isPending = addTracks.isPending;
  const count = target.entries.length;
  const targetLabel = count === 1 ? target.entries[0].title : `${count.toLocaleString()} tracks`;

  const groups: PaletteGroup[] = [
    {
      items: library.playlists.map((playlist) => ({ kind: "playlist", playlist })),
      value: "playlists",
    },
    { items: [createItem], value: "actions" },
  ];

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPending) return;
    onOpenChange(nextOpen);
  };

  const handleOpenChangeComplete = (nextOpen: boolean) => {
    if (nextOpen) return;

    addTracks.reset();
    setConfirmation(null);
    setSearch("");
  };

  const handleAdded = (playlist: PlaylistSummary) => {
    toast.add({
      title:
        count === 1 ? `Added to ${playlist.title}` : `Added ${targetLabel} to ${playlist.title}`,
      type: "success",
    });
    onOpenChange(false);
  };

  const handleSelect = (item: PaletteItem) => {
    if (isPending || isSubmittingRef.current) return;

    if (item.kind === "create") {
      onCreatePlaylist(target);
      onOpenChange(false);

      return;
    }

    const { playlist } = item;
    const isConfirmed = confirmation?.playlistId === playlist.id;

    if (!isConfirmed) setConfirmation(null);

    isSubmittingRef.current = true;
    addTracks.mutate(
      {
        duplicates: isConfirmed ? "confirmed" : "check",
        playlistId: playlist.id,
        trackIds: target.entries.map((entry) => entry.trackId),
      },
      {
        onSettled: () => {
          isSubmittingRef.current = false;
        },
        onSuccess: (result) => {
          if (result.kind === "duplicate") {
            setConfirmation({
              alreadyInPlaylist: result.alreadyInPlaylist,
              playlistId: playlist.id,
            });

            return;
          }

          handleAdded(playlist);
        },
      },
    );
  };

  const enterHint =
    highlighted?.kind === "create"
      ? "create"
      : highlighted?.kind === "playlist" && highlighted.playlist.id === confirmation?.playlistId
        ? "add anyway"
        : "add";

  const error = addTracks.error;

  const confirmationTitle = library.playlists.find(
    (playlist) => playlist.id === confirmation?.playlistId,
  )?.title;

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
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
            Choose a playlist for {targetLabel}.
          </DialogDescription>
          <Autocomplete.Root
            autoHighlight="always"
            filter={(item: PaletteItem, query) =>
              item.kind === "create" ||
              item.playlist.title.toLowerCase().includes(query.trim().toLowerCase())
            }
            inline
            itemToStringValue={(item: PaletteItem) =>
              item.kind === "create" ? "" : item.playlist.title
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
                  if (
                    event.key !== "Enter" ||
                    !(window.lume.isMac ? event.metaKey : event.ctrlKey)
                  ) {
                    return;
                  }

                  event.preventDefault();
                  handleSelect(createItem);
                }}
                placeholder="Add to playlist…"
              />
            </div>
            <Autocomplete.List className="flex max-h-[min(400px,50vh)] scroll-py-2 flex-col overflow-y-auto overscroll-contain p-2">
              {(group: PaletteGroup) => (
                <Autocomplete.Group items={group.items} key={group.value}>
                  {group.value === "playlists" && (
                    <Autocomplete.GroupLabel className="flex h-8 items-center px-2 text-meta font-medium text-secondary">
                      Playlists
                    </Autocomplete.GroupLabel>
                  )}
                  <Autocomplete.Collection>
                    {(item: PaletteItem) => (
                      <PaletteRow
                        alreadyInPlaylist={
                          item.kind === "playlist" && item.playlist.id === confirmation?.playlistId
                            ? confirmation.alreadyInPlaylist
                            : null
                        }
                        item={item}
                        targetCount={count}
                        key={item.kind === "create" ? "create" : item.playlist.id}
                        onSelect={handleSelect}
                      />
                    )}
                  </Autocomplete.Collection>
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
            <FieldError className="px-4 pb-2">{error?.message}</FieldError>
            <p aria-live="polite" className="sr-only">
              {confirmation &&
                confirmationTitle &&
                (count === 1
                  ? `${targetLabel} is already in ${confirmationTitle}. Choose it again to add it twice.`
                  : `${confirmation.alreadyInPlaylist.toLocaleString()} of ${targetLabel} are already in ${confirmationTitle}. Choose it again to add all ${count.toLocaleString()} anyway.`)}
            </p>
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
                {enterHint}
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
  alreadyInPlaylist,
  item,
  onSelect,
  targetCount,
}: {
  alreadyInPlaylist: number | null;
  item: PaletteItem;
  onSelect: (item: PaletteItem) => void;
  targetCount: number;
}) {
  const label =
    item.kind === "playlist"
      ? item.playlist.title
      : targetCount === 1
        ? "New playlist with this track"
        : `New playlist from ${targetCount.toLocaleString()} tracks`;

  return (
    <Autocomplete.Item
      className="group/palette-row flex min-h-10 shrink-0 cursor-default flex-col justify-center rounded-sm px-2 text-body text-primary outline-none select-none data-highlighted:bg-hover data-highlighted:font-medium data-highlighted:[font-variation-settings:'opsz'_19.75]"
      onClick={() => onSelect(item)}
      value={item}
    >
      <span className="flex h-10 items-center gap-3">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="flex min-w-24 shrink-0 items-center justify-end gap-2 font-mono whitespace-nowrap text-meta font-normal text-secondary tabular-nums">
          {item.kind === "playlist" &&
            (alreadyInPlaylist !== null ? (
              alreadyInText(alreadyInPlaylist, targetCount)
            ) : (
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
            ))}
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
        </span>
      </span>
      {alreadyInPlaylist !== null && (
        <span className="-mt-1.5 pb-2 text-meta font-normal text-secondary">
          {targetCount === 1
            ? "Adds it again"
            : `Adds all ${targetCount.toLocaleString()} again, repeats included`}
        </span>
      )}
    </Autocomplete.Item>
  );
}

function alreadyInText(alreadyInPlaylist: number, targetCount: number) {
  return targetCount === 1
    ? "already in it"
    : `${alreadyInPlaylist.toLocaleString()} of ${targetCount.toLocaleString()} already in it`;
}

function CreateShortcut() {
  return (
    <span aria-hidden="true" className={cn("flex items-center", !window.lume.isMac && "gap-1")}>
      {window.lume.isMac ? <CommandIcon className="size-3" weight="bold" /> : "Ctrl"}
      <ArrowElbowDownLeftIcon className="size-3" weight="bold" />
    </span>
  );
}
