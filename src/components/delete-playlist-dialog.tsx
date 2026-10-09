import { useNavigate, useParams } from "@tanstack/react-router";
import type { KeyboardEvent, RefObject } from "react";
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
import { Kbd } from "@/components/ui/kbd";
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
          if (isOpenPlaylist) void navigate({ replace: true, to: "/" });
          libraryMutation.reset();
          onOpenChange(false);
        },
      },
    );
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Backspace" || !(window.lume.isMac ? event.metaKey : event.ctrlKey)) return;

    event.preventDefault();

    if (!libraryMutation.isPending) handleDelete();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent finalFocus={finalFocus} onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {playlist.title}?</AlertDialogTitle>
          <AlertDialogDescription>{describeTracks(playlist.trackCount)}</AlertDialogDescription>
          <FieldError>{libraryMutation.error?.message}</FieldError>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={libraryMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            aria-keyshortcuts={window.lume.isMac ? "Meta+Backspace" : "Control+Backspace"}
            busy={libraryMutation.isPending}
            onClick={handleDelete}
            variant="danger"
          >
            Delete playlist
            <Kbd aria-hidden="true" variant="danger">
              {window.lume.isMac ? "⌘⌫" : "Ctrl ⌫"}
            </Kbd>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describeTracks(trackCount: number) {
  if (trackCount === 0) return "It has no tracks.";

  if (trackCount === 1) return "Its one track stays in your library.";

  return `Its ${trackCount.toLocaleString()} tracks stay in your library.`;
}
