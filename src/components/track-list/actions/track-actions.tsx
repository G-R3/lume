import { useRef, useState } from "react";
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
import type { PlayableSource, QueuePosition } from "@/lib/queue/commands";
import {
  type AddRequest,
  type AddToPlaylistEvent,
  type AddToPlaylistFlow,
  describeAddition,
  idleFlow,
  reduceAddToPlaylist,
  requestOf,
} from "@/components/track-list/actions/add-to-playlist-flow";
import type { ActionTarget } from "@/components/track-list/selection/track-selection";

export type TrackAction =
  | { kind: "queue"; target: ActionTarget }
  | { kind: "playNext"; target: ActionTarget }
  | { kind: "like"; target: ActionTarget }
  | { kind: "addToPlaylist"; target: ActionTarget }
  | { kind: "createPlaylist"; target: ActionTarget }
  | { kind: "removeFromPlaylist"; target: ActionTarget };

export function useTrackActions(source: PlayableSource) {
  const { enqueueTracks, queue } = usePlayback();
  const { mutateAsync: setTracksLiked } = useSetTracksLiked();
  const { mutateAsync: removePlaylistTracks } = useRemovePlaylistTracksMutation();
  const { mutateAsync: addTracksToPlaylist } = useAddTracksToPlaylistMutation();
  const openPlaylistCreation = usePlaylistCreation();
  const [flow, setFlow] = useState<AddToPlaylistFlow>(idleFlow);
  const flowRef = useRef(flow);
  const playlistTitle = source.kind === "playlist" ? source.title : null;

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

  const enqueue = (target: ActionTarget, position: QueuePosition) =>
    enqueueTracks(
      target.entries.map((entry) => entry.trackId),
      position,
    );

  const toggleLike = async (target: ActionTarget) => {
    try {
      await setTracksLiked({
        liked: target.entries.some((entry) => !entry.liked),
        trackIds: target.entries.map((entry) => entry.trackId),
      });
    } catch (error) {
      toast.add({
        description: error instanceof Error ? error.message : String(error),
        priority: "high",
        title: "Could not update like",
        type: "error",
      });
    }
  };

  const run = (action: TrackAction) => {
    const { target } = action;

    switch (action.kind) {
      case "queue":
        enqueue(target, "end");

        return;
      case "playNext":
        enqueue(target, "start");

        return;
      case "like":
        void toggleLike(target);

        return;
      case "addToPlaylist":
        applyFlowEvent({ target, type: "open" });

        return;
      case "createPlaylist":
        openPlaylistCreation({ target });

        return;
      case "removeFromPlaylist":
        if (target.context.kind === "playlist") {
          void removeFromPlaylist(target.context.playlistId, target);
        }
    }
  };

  const shown = flow.phase === "closed" ? flow.last : flow;

  const playlistPicker =
    shown.phase === "picking" || shown.phase === "checking" ? (
      <AddToPlaylistDialog
        error={shown.phase === "picking" ? shown.error : null}
        onQueue={
          queue === null
            ? null
            : (position) => {
                if (applyFlowEvent({ type: "queue" })) enqueue(shown.target, position);
              }
        }
        onCreatePlaylist={() => {
          if (applyFlowEvent({ type: "createInstead" }))
            openPlaylistCreation({ target: shown.target });
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
        onChoose={(mode) => applyFlowEvent({ mode, type: "choose" })}
        onDismiss={() => applyFlowEvent({ type: "dismiss" })}
        onExited={() => applyFlowEvent({ type: "exited" })}
        open={flow.phase === "confirmingDuplicates" || flow.phase === "adding"}
      />
    ) : null;

  return { playlistPicker, run };
}
