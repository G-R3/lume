import type { AddTracksToPlaylistResult } from "../../../shared/lib";
import type { SelectionAction } from "./selection-shortcuts";
import type { ActionTarget } from "./track-selection";

export type FocusReturn = number | SelectionAction | null;

export type Destination = { readonly playlistId: number; readonly title: string };

export type DuplicateMode = "allow" | "skip";

export type DuplicateCounts = {
  readonly alreadyInPlaylist: number;
  readonly newTrackCount: number;
};

type Origin = { readonly target: ActionTarget; readonly returnTo: FocusReturn };

export type PickerPhase = Origin &
  (
    | { readonly phase: "picking"; readonly error: string | null }
    | { readonly phase: "checking"; readonly destination: Destination }
  );

export type ConfirmationPhase = Origin & {
  readonly destination: Destination;
  readonly duplicates: DuplicateCounts;
} & (
    | { readonly phase: "confirmingDuplicates"; readonly error: string | null }
    | { readonly phase: "adding"; readonly mode: DuplicateMode }
  );

export type OpenPhase = PickerPhase | ConfirmationPhase;

export type AddToPlaylistFlow =
  | { readonly phase: "idle" }
  | { readonly phase: "closed"; readonly last: OpenPhase; readonly returnFocus: boolean }
  | OpenPhase;

export type AddToPlaylistEvent =
  | { type: "open"; target: ActionTarget; returnTo: FocusReturn }
  | { type: "pick"; destination: Destination }
  | { type: "createInstead" }
  | { type: "choose"; mode: DuplicateMode }
  | { type: "settled"; result: AddTracksToPlaylistResult }
  | { type: "failed"; message: string }
  | { type: "dismiss" }
  | { type: "exited" };

export type AddRequest = {
  readonly destination: Destination;
  readonly duplicates: "check" | DuplicateMode;
  readonly trackIds: readonly number[];
};

export const idleFlow: AddToPlaylistFlow = { phase: "idle" };

export function reduceAddToPlaylist(
  state: AddToPlaylistFlow,
  event: AddToPlaylistEvent,
): AddToPlaylistFlow {
  switch (event.type) {
    case "open":
      if (state.phase !== "idle" && state.phase !== "closed") return state;

      return { error: null, phase: "picking", returnTo: event.returnTo, target: event.target };
    case "pick":
      if (state.phase !== "picking") return state;

      return {
        destination: event.destination,
        phase: "checking",
        returnTo: state.returnTo,
        target: state.target,
      };
    case "createInstead":
      if (state.phase !== "picking") return state;

      return { last: state, phase: "closed", returnFocus: false };
    case "choose":
      if (state.phase !== "confirmingDuplicates") return state;

      if (event.mode === "skip" && state.duplicates.newTrackCount === 0) return state;

      return { ...state, mode: event.mode, phase: "adding" };
    case "settled":
      if (state.phase === "adding") return { last: state, phase: "closed", returnFocus: true };

      if (state.phase !== "checking") return state;

      if (event.result.kind === "added") return { last: state, phase: "closed", returnFocus: true };

      return {
        destination: state.destination,
        duplicates: {
          alreadyInPlaylist: event.result.alreadyInPlaylist,
          newTrackCount: event.result.newTrackCount,
        },
        error: null,
        phase: "confirmingDuplicates",
        returnTo: state.returnTo,
        target: state.target,
      };
    case "failed":
      if (state.phase === "checking") {
        return {
          error: event.message,
          phase: "picking",
          returnTo: state.returnTo,
          target: state.target,
        };
      }

      if (state.phase === "adding") {
        return {
          destination: state.destination,
          duplicates: state.duplicates,
          error: event.message,
          phase: "confirmingDuplicates",
          returnTo: state.returnTo,
          target: state.target,
        };
      }

      return state;
    case "dismiss":
      if (state.phase !== "picking" && state.phase !== "confirmingDuplicates") return state;

      return { last: state, phase: "closed", returnFocus: true };
    case "exited":
      return state.phase === "closed" ? idleFlow : state;
  }
}

export function requestOf(state: AddToPlaylistFlow): AddRequest | null {
  if (state.phase === "checking") {
    return {
      destination: state.destination,
      duplicates: "check",
      trackIds: state.target.entries.map((entry) => entry.trackId),
    };
  }

  if (state.phase === "adding") {
    return {
      destination: state.destination,
      duplicates: state.mode,
      trackIds: state.target.entries.map((entry) => entry.trackId),
    };
  }

  return null;
}

export function describeAddition(request: AddRequest, addedCount: number): string {
  const { title } = request.destination;
  const targetCount = request.trackIds.length;

  if (addedCount === 0) {
    return targetCount === 1
      ? `Already in ${title}`
      : `All ${targetCount.toLocaleString()} already in ${title}`;
  }

  if (request.duplicates !== "skip" && targetCount === 1) return `Added to ${title}`;

  return `Added ${addedCount.toLocaleString()} ${addedCount === 1 ? "track" : "tracks"} to ${title}`;
}

export function describeDuplicates(
  { alreadyInPlaylist }: DuplicateCounts,
  target: ActionTarget,
  title: string,
): string {
  const count = target.entries.length;

  if (count === 1) return `${target.entries[0].title} is already in ${title}.`;

  if (alreadyInPlaylist === count) {
    return `All ${count.toLocaleString()} tracks are already in ${title}.`;
  }

  return `${alreadyInPlaylist.toLocaleString()} of ${count.toLocaleString()} tracks ${alreadyInPlaylist === 1 ? "is" : "are"} already in ${title}.`;
}
