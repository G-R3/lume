import { type RefObject, useState } from "react";
import type { PlaylistSummary, Track } from "../../shared/lib";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import {
  useAddTrackToPlaylistMutation,
  useConfirmAddTrackToPlaylistMutation,
} from "@/lib/library-query";

type AddToPlaylistDialogProps = {
  finalFocus: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  track: Track;
};

export function AddToPlaylistDialog({
  finalFocus,
  onOpenChange,
  open,
  track,
}: AddToPlaylistDialogProps) {
  const library = useMusicLibrary();
  const addTrack = useAddTrackToPlaylistMutation();
  const confirmAddTrack = useConfirmAddTrackToPlaylistMutation();
  const [playlistToConfirm, setPlaylistToConfirm] = useState<PlaylistSummary | null>(null);
  const [search, setSearch] = useState("");
  const isPending = addTrack.isPending || confirmAddTrack.isPending;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPending) return;

    if (!nextOpen) {
      addTrack.reset();
      confirmAddTrack.reset();
      setPlaylistToConfirm(null);
      setSearch("");
    }

    onOpenChange(nextOpen);
  };

  const handleAdded = (playlist: PlaylistSummary) => {
    toast.add({ title: `Added to ${playlist.title}`, type: "success" });
    setPlaylistToConfirm(null);
    setSearch("");
    onOpenChange(false);
  };

  const handleAdd = (playlist: PlaylistSummary) => {
    addTrack.mutate(
      { playlistId: playlist.id, trackId: track.id },
      {
        onSuccess: (result) => {
          if (result.kind === "duplicate") {
            setPlaylistToConfirm(playlist);
            return;
          }

          handleAdded(playlist);
        },
      },
    );
  };

  const handleConfirm = () => {
    if (!playlistToConfirm) return;

    confirmAddTrack.mutate(
      { playlistId: playlistToConfirm.id, trackId: track.id },
      { onSuccess: () => handleAdded(playlistToConfirm) },
    );
  };

  const normalizedSearch = search.trim().toLowerCase();
  const playlists = library.playlists.filter((playlist) =>
    playlist.title.toLowerCase().includes(normalizedSearch),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent finalFocus={finalFocus} showCloseButton={!isPending}>
        {playlistToConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>Already added</DialogTitle>
              <DialogDescription>
                This is already added in your {playlistToConfirm.title}.
              </DialogDescription>
            </DialogHeader>
            <FieldError>{confirmAddTrack.error?.message}</FieldError>
            <DialogFooter>
              <DialogClose disabled={isPending} render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button disabled={isPending} onClick={handleConfirm} type="button">
                {isPending ? "Adding..." : "Add anyway"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add to playlist</DialogTitle>
              <DialogDescription className="sr-only">
                Choose a playlist for {track.name}.
              </DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Search playlists"
              autoFocus
              disabled={isPending}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search playlists"
              value={search}
            />
            {playlists.length > 0 ? (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <Button
                      className="h-auto w-full justify-start px-2 py-2 text-left"
                      disabled={isPending}
                      onClick={() => handleAdd(playlist)}
                      type="button"
                      variant="ghost"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-neutral-100">{playlist.title}</span>
                        {playlist.description && (
                          <span className="block truncate font-normal text-neutral-500">
                            {playlist.description}
                          </span>
                        )}
                      </span>
                      <span className="font-berkeley shrink-0 text-[10px] text-neutral-500 tabular-nums">
                        {playlist.entryCount.toLocaleString()}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-neutral-500">
                {library.playlists.length === 0 ? "No playlists yet." : "No playlists found."}
              </p>
            )}
            <FieldError>{addTrack.error?.message}</FieldError>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
