import { useNavigate, useParams } from "@tanstack/react-router";
import type { RefObject } from "react";
import type { PlaylistSummary } from "../../shared/lib";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/field";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useLibraryMutation } from "@/lib/library-query";

type DeletePlaylistDialogProps = {
  finalFocus?: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  playlist: PlaylistSummary;
};

export function DeletePlaylistDialog({
  finalFocus,
  onOpenChange,
  open,
  playlist,
}: DeletePlaylistDialogProps) {
  const audioPlayer = useAudioPlayer();
  const libraryMutation = useLibraryMutation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });

  const isOpenPlaylist = params.playlistId === playlist.id;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && libraryMutation.isPending) return;

    if (!nextOpen) libraryMutation.reset();
    onOpenChange(nextOpen);
  };

  const handleDelete = () => {
    libraryMutation.mutate(
      { kind: "delete-playlist", playlistId: playlist.id },
      {
        onSuccess: () => {
          audioPlayer.clearPlaylistQueue(playlist.id);

          if (isOpenPlaylist) void navigate({ replace: true, to: "/" });
          libraryMutation.reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {playlist.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the playlist and its {playlist.entryCount.toLocaleString()}{" "}
            {playlist.entryCount === 1 ? "entry" : "entries"}. Your music files will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldError>{libraryMutation.error?.message}</FieldError>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={libraryMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={libraryMutation.isPending}
            onClick={handleDelete}
            variant="destructive"
          >
            {libraryMutation.isPending ? "Deleting..." : "Delete playlist"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
