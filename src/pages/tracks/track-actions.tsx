import { type RefObject, useRef, useState } from "react";
import { AddToPlaylistDialog } from "@/components/add-to-playlist-dialog";
import { toast } from "@/components/ui/toast";
import { usePlayback } from "@/hooks/use-playback";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useSetTracksLiked } from "@/lib/library-query";
import { useRemovePlaylistTracksMutation } from "@/lib/playlist-mutations";
import type { PlayableSource } from "@/lib/queue/commands";
import type { ActionTarget } from "@/pages/tracks/track-selection";

export type FocusReturn = number | "addToPlaylist" | "createPlaylist" | null;

export type TrackAction =
  | { kind: "queue"; target: ActionTarget }
  | { kind: "like"; target: ActionTarget }
  | { kind: "addToPlaylist"; target: ActionTarget; returnTo: FocusReturn }
  | { kind: "createPlaylist"; target: ActionTarget; returnTo: FocusReturn }
  | { kind: "removeFromPlaylist"; target: ActionTarget };

export function focusReturnTarget(region: HTMLElement | null, to: FocusReturn) {
  if (!region?.isConnected) return false;

  return (
    region.querySelector<HTMLElement>(
      to === "addToPlaylist" || to === "createPlaylist"
        ? `[role='toolbar'] [data-bar-action="${to}"]`
        : `tr[data-entry-id="${to}"]`,
    ) ??
    region.querySelector<HTMLElement>("tr[data-entry-id][tabindex='0']") ??
    false
  );
}

export function useTrackActions(source: PlayableSource, regionRef: RefObject<HTMLElement | null>) {
  const { enqueueTracks } = usePlayback();
  const { mutate: setTracksLiked } = useSetTracksLiked();
  const { mutateAsync: removePlaylistTracks } = useRemovePlaylistTracksMutation();
  const openPlaylistCreation = usePlaylistCreation();

  const [picker, setPicker] = useState<{
    open: boolean;
    returnTo: FocusReturn;
    target: ActionTarget;
  } | null>(null);

  const pickerHandedOffRef = useRef(false);
  const playlistTitle = source.kind === "playlist" ? source.title : null;

  const openCreation = (target: ActionTarget, returnTo: FocusReturn) =>
    openPlaylistCreation({
      finalFocus: () => focusReturnTarget(regionRef.current, returnTo),
      target,
    });

  const removeFromPlaylist = async (playlistId: number, target: ActionTarget) => {
    const count = target.entries.length;
    const title = playlistTitle ?? "playlist";

    const removedTitle =
      count === 1
        ? `Removed from ${title}`
        : `Removed ${count.toLocaleString()} tracks from ${title}`;

    const failedTitle =
      count === 1
        ? "Could not remove track from playlist"
        : "Could not remove tracks from playlist";

    const playlistTrackIds = target.entries.map((entry) => entry.sourceEntryId);

    // Removing every row unmounts this list, which drops per-call mutate callbacks.
    try {
      await removePlaylistTracks({ playlistId, playlistTrackIds });
      toast.add({ title: removedTitle, type: "success" });
    } catch (error) {
      let description = String(error);

      if (error instanceof Error) description = error.message;

      toast.add({
        description,
        priority: "high",
        title: failedTitle,
        type: "error",
      });
    }
  };

  const run = (action: TrackAction) => {
    const { target } = action;

    switch (action.kind) {
      case "queue":
        enqueueTracks(target.entries.map((entry) => entry.trackId));

        return;
      case "like":
        setTracksLiked(
          {
            liked: target.entries.some((entry) => !entry.liked),
            trackIds: target.entries.map((entry) => entry.trackId),
          },
          {
            onError: (error) => {
              toast.add({
                description: error.message,
                priority: "high",
                title: "Could not update like",
                type: "error",
              });
            },
          },
        );

        return;
      case "addToPlaylist":
        pickerHandedOffRef.current = false;
        setPicker({ open: true, returnTo: action.returnTo, target });

        return;
      case "createPlaylist":
        openCreation(target, action.returnTo);

        return;
      case "removeFromPlaylist":
        if (target.context.kind === "playlist") {
          void removeFromPlaylist(target.context.playlistId, target);
        }
    }
  };

  const playlistPicker = picker && (
    <AddToPlaylistDialog
      finalFocus={() =>
        pickerHandedOffRef.current ? false : focusReturnTarget(regionRef.current, picker.returnTo)
      }
      onCreatePlaylist={(target) => {
        pickerHandedOffRef.current = true;
        openCreation(target, picker.returnTo);
      }}
      onOpenChange={(open) => setPicker((current) => current && { ...current, open })}
      open={picker.open}
      target={picker.target}
    />
  );

  return { openCreation, playlistPicker, run };
}
