import { useRef } from "react";
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
import {
  type ConfirmationPhase,
  describeDuplicates,
  type DuplicateMode,
} from "@/components/track-list/actions/add-to-playlist-flow";

type DuplicateTracksDialogProps = {
  addingMode: DuplicateMode | null;
  confirmation: ConfirmationPhase;
  error: string | null;
  onChoose: (mode: DuplicateMode) => void;
  onDismiss: () => void;
  onExited: () => void;
  open: boolean;
};

export function DuplicateTracksDialog({
  addingMode,
  confirmation,
  error,
  onChoose,
  onDismiss,
  onExited,
  open,
}: DuplicateTracksDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { destination, duplicates, target } = confirmation;
  const hasNewTracks = duplicates.newTrackCount > 0;
  const isAdding = addingMode !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onExited();
      }}
    >
      <AlertDialogContent initialFocus={primaryRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Add to {destination.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            {describeDuplicates(duplicates, target, destination.title)}
          </AlertDialogDescription>
          <FieldError>{error}</FieldError>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isAdding}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            busy={addingMode === "allow"}
            disabled={isAdding}
            onClick={() => onChoose("allow")}
            ref={hasNewTracks ? undefined : primaryRef}
            variant={hasNewTracks ? "secondary" : "primary"}
          >
            Add anyway
          </AlertDialogAction>
          {hasNewTracks && (
            <AlertDialogAction
              busy={addingMode === "skip"}
              disabled={isAdding}
              onClick={() => onChoose("skip")}
              ref={primaryRef}
              variant="primary"
            >
              Add only new
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
