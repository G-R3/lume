import { type RefObject, useRef, useState } from "react";
import { AddToPlaylistDialog } from "@/components/track-list/actions/add-to-playlist-dialog";
import { DuplicateTracksDialog } from "@/components/track-list/actions/duplicate-tracks-dialog";
import { toast } from "@/components/ui/toast";
import { usePlayback } from "@/hooks/use-playback";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useSetTracksLiked } from "@/lib/library-query";
import {
  useAddTracksToPlaylistMutation,
  useRemovePlaylistTracksMutation,
} from "@/lib/playlist-mutations";
import type { PlayableSource } from "@/lib/queue/commands";
import {
  type AddRequest,
  type AddToPlaylistEvent,
  type AddToPlaylistFlow,
  describeAddition,
  type FocusReturn,
  idleFlow,
  reduceAddToPlaylist,
  requestOf,
} from "@/components/track-list/actions/add-to-playlist-flow";
import { isSelectionAction } from "@/components/track-list/selection/selection-shortcuts";
import type { ActionTarget } from "@/components/track-list/selection/track-selection";

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
      to !== null && isSelectionAction(to)
        ? `[role='toolbar'] [data-bar-action="${to}"]`
        : `tr[data-entry-id="${to}"]`,
    ) ??
    region.querySelector<HTMLElement>("tr[data-entry-id][tabindex='0']") ??
    false
  );
}

export function useTrackActions(source: PlayableSource, regionRef: RefObject<HTMLElement | null>) {
  const { enqueueTracks, queue } = usePlayback();
  const { mutate: setTracksLiked } = useSetTracksLiked();
  const { mutateAsync: removePlaylistTracks } = useRemovePlaylistTracksMutation();
  const { mutateAsync: addTracksToPlaylist } = useAddTracksToPlaylistMutation();
  const openPlaylistCreation = usePlaylistCreation();
  const [flow, setFlow] = useState<AddToPlaylistFlow>(idleFlow);
  const flowRef = useRef(flow);
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

  const submitAddition = async (request: AddRequest) => {
    try {
      const result = await addTracksToPlaylist({
        duplicates: request.duplicates,
        playlistId: request.destination.playlistId,
        trackIds: request.trackIds,
      });

      applyFlowEvent({ result, type: "settled" });

      if (result.kind === "added") {
        toast.add({
          title: describeAddition(request, result.tracks.length),
          type: "success",
        });
      }
    } catch (error) {
      applyFlowEvent({
        message: error instanceof Error ? error.message : String(error),
        type: "failed",
      });
    }
  };

  const applyFlowEvent = (event: AddToPlaylistEvent) => {
    const previous = flowRef.current;
    const next = reduceAddToPlaylist(previous, event);

    if (next === previous) return false;

    flowRef.current = next;
    setFlow(next);

    const request = requestOf(next);

    if (request) void submitAddition(request);

    return true;
  };

  const addToQueue = (target: ActionTarget) =>
    enqueueTracks(target.entries.map((entry) => entry.trackId));

  const run = (action: TrackAction) => {
    const { target } = action;

    switch (action.kind) {
      case "queue":
        addToQueue(target);

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
        applyFlowEvent({ returnTo: action.returnTo, target, type: "open" });

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

  const shown = flow.phase === "closed" ? flow.last : flow;

  const finalFocus = () =>
    flow.phase === "closed" &&
    flow.returnFocus &&
    focusReturnTarget(regionRef.current, flow.last.returnTo);

  const playlistPicker =
    shown.phase === "picking" || shown.phase === "checking" ? (
      <AddToPlaylistDialog
        error={shown.phase === "picking" ? shown.error : null}
        finalFocus={finalFocus}
        onAddToQueue={
          queue === null
            ? null
            : () => {
                if (applyFlowEvent({ type: "addToQueue" })) addToQueue(shown.target);
              }
        }
        onCreatePlaylist={() => {
          if (applyFlowEvent({ type: "createInstead" })) openCreation(shown.target, shown.returnTo);
        }}
        onDismiss={() => applyFlowEvent({ type: "dismiss" })}
        onExited={() => applyFlowEvent({ type: "exited" })}
        onPick={(playlist) =>
          applyFlowEvent({
            destination: { playlistId: playlist.id, title: playlist.title },
            type: "pick",
          })
        }
        open={flow.phase === "picking" || flow.phase === "checking"}
        target={shown.target}
      />
    ) : shown.phase === "confirmingDuplicates" || shown.phase === "adding" ? (
      <DuplicateTracksDialog
        addingMode={flow.phase === "adding" ? flow.mode : null}
        confirmation={shown}
        error={shown.phase === "confirmingDuplicates" ? shown.error : null}
        finalFocus={finalFocus}
        onChoose={(mode) => applyFlowEvent({ mode, type: "choose" })}
        onDismiss={() => applyFlowEvent({ type: "dismiss" })}
        onExited={() => applyFlowEvent({ type: "exited" })}
        open={flow.phase === "confirmingDuplicates" || flow.phase === "adding"}
      />
    ) : null;

  return { playlistPicker, run };
}
