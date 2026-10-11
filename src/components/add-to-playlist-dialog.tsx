import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { PlaylistIcon, PlusIcon } from "@phosphor-icons/react";
import { type RefObject, useState } from "react";
import type { PlaylistSummary, Track } from "../../shared/lib";
import { TrackArtwork } from "@/components/track-artwork";
import { Dialog, DialogDescription, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import {
  useAddTrackToPlaylistMutation,
  useConfirmAddTrackToPlaylistMutation,
} from "@/lib/library-query";

type PaletteItem = { kind: "create" } | { kind: "playlist"; playlist: PlaylistSummary };

type PaletteGroup = { items: PaletteItem[]; value: "actions" | "playlists" };

const createItem: PaletteItem = { kind: "create" };

type AddToPlaylistDialogProps = Pick<DialogPrimitive.Portal.Props, "container"> &
  Pick<DialogPrimitive.Root.Props, "modal"> &
  Pick<DialogPrimitive.Popup.Props, "initialFocus"> & {
    finalFocus: RefObject<HTMLElement | null>;
    onCreatePlaylist: (track: Track) => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    track: Track;
  };

export function AddToPlaylistDialog({
  container,
  finalFocus,
  initialFocus,
  modal = true,
  onCreatePlaylist,
  onOpenChange,
  open,
  track,
}: AddToPlaylistDialogProps) {
  const library = useMusicLibrary();
  const addTrack = useAddTrackToPlaylistMutation();
  const confirmAddTrack = useConfirmAddTrackToPlaylistMutation();
  const [alreadyAddedId, setAlreadyAddedId] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<PaletteItem | undefined>();
  const [search, setSearch] = useState("");
  const isPending = addTrack.isPending || confirmAddTrack.isPending;

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

    addTrack.reset();
    confirmAddTrack.reset();
    setAlreadyAddedId(null);
    setSearch("");
  };

  const handleAdded = (playlist: PlaylistSummary) => {
    toast.add({ title: `Added to ${playlist.title}`, type: "success" });
    onOpenChange(false);
  };

  const handleSelect = (item: PaletteItem) => {
    if (isPending) return;

    if (item.kind === "create") {
      onCreatePlaylist(track);
      onOpenChange(false);

      return;
    }

    const { playlist } = item;
    const input = { playlistId: playlist.id, trackId: track.id };

    if (alreadyAddedId === playlist.id) {
      confirmAddTrack.mutate(input, { onSuccess: () => handleAdded(playlist) });

      return;
    }

    addTrack.mutate(input, {
      onSuccess: (result) => {
        if (result.kind === "duplicate") {
          setAlreadyAddedId(playlist.id);

          return;
        }

        handleAdded(playlist);
      },
    });
  };

  const enterHint =
    highlighted?.kind === "create"
      ? "create"
      : highlighted?.kind === "playlist" && highlighted.playlist.id === alreadyAddedId
        ? "add again"
        : "add";

  const error = addTrack.error ?? confirmAddTrack.error;

  const alreadyAddedTitle = library.playlists.find(
    (playlist) => playlist.id === alreadyAddedId,
  )?.title;

  return (
    <Dialog
      modal={modal}
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <DialogPrimitive.Portal container={container}>
        <DialogOverlay className="transition-none" />
        <DialogPrimitive.Popup
          className="fixed top-24 left-1/2 z-50 flex w-140 max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-clip rounded-xl bg-raised p-px text-primary shadow-dialog inset-ring inset-ring-default outline-none"
          data-slot="palette"
          finalFocus={finalFocus}
          initialFocus={initialFocus}
        >
          <DialogTitle className="sr-only">Add to playlist</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a playlist for {track.title}.
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
                <TrackArtwork artworkUrl={track.artworkUrl} className="h-4 w-3 rounded-xs" />
                <span className="truncate text-meta text-primary">{track.title}</span>
              </span>
              <Autocomplete.Input
                aria-label="Find a playlist"
                className="h-full min-w-0 flex-1 bg-transparent text-title font-normal tracking-normal text-primary caret-accent outline-none placeholder:text-placeholder"
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
                        alreadyAdded={
                          item.kind === "playlist" && item.playlist.id === alreadyAddedId
                        }
                        item={item}
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
              {alreadyAddedTitle &&
                `${track.title} is already in ${alreadyAddedTitle}. Choose it again to add it twice.`}
            </p>
            <div className="flex h-10 shrink-0 items-center gap-4 rounded-b-[11px] border-t border-separator bg-inset px-4 font-mono text-meta text-secondary">
              <span>↑↓ move</span>
              <span>↵ {enterHint}</span>
              <span className="ml-auto">esc</span>
            </div>
          </Autocomplete.Root>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

function PaletteRow({
  alreadyAdded,
  item,
  onSelect,
}: {
  alreadyAdded: boolean;
  item: PaletteItem;
  onSelect: (item: PaletteItem) => void;
}) {
  return (
    <Autocomplete.Item
      className="group/palette-row flex h-10 shrink-0 cursor-default items-center gap-3 rounded-sm px-2 text-body text-primary outline-none select-none data-highlighted:bg-selected data-highlighted:font-medium"
      onClick={() => onSelect(item)}
      value={item}
    >
      {item.kind === "create" ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-sm inset-ring inset-ring-strong">
          <PlusIcon aria-hidden="true" className="size-3 text-secondary" />
        </span>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-overlay outline outline-offset-[-1px] outline-image">
          <PlaylistIcon aria-hidden="true" className="size-3 text-secondary" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {item.kind === "create" ? "New playlist with this track" : item.playlist.title}
      </span>
      <span className="flex min-w-24 shrink-0 items-center justify-end gap-2 font-mono whitespace-nowrap text-meta font-normal text-secondary tabular-nums">
        {item.kind === "playlist" &&
          (alreadyAdded ? "already in it" : item.playlist.trackCount.toLocaleString())}
        <Kbd
          aria-hidden="true"
          className="hidden group-data-highlighted/palette-row:inline-flex"
          size="lg"
        >
          ↵
        </Kbd>
      </span>
    </Autocomplete.Item>
  );
}
