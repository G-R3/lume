import { expect, it } from "vite-plus/test";
import {
  type AddToPlaylistEvent,
  type AddToPlaylistFlow,
  describeAddition,
  describeDuplicates,
  idleFlow,
  reduceAddToPlaylist,
  requestOf,
} from "../src/components/track-list/actions/add-to-playlist-flow";
import type {
  ActionTarget,
  TargetEntry,
} from "../src/components/track-list/selection/track-selection";

function entry(sourceEntryId: number, trackId = sourceEntryId): TargetEntry {
  return { artworkUrl: null, liked: false, sourceEntryId, title: `Track ${trackId}`, trackId };
}

const target: ActionTarget = {
  context: { kind: "all-tracks" },
  entries: [entry(1, 10), entry(2, 20), entry(3, 10), entry(4, 30)],
};

const mix = { playlistId: 7, title: "Mix" };

const road = { playlistId: 8, title: "Road" };

const open = { returnTo: 1, target, type: "open" } as const;

const pick = (destination = mix) => ({ destination, type: "pick" }) as const;

const duplicate = (alreadyInPlaylist: number, newTrackCount: number) =>
  ({
    result: { alreadyInPlaylist, kind: "duplicate", newTrackCount },
    type: "settled",
  }) as const;

const added: AddToPlaylistEvent = { result: { kind: "added", tracks: [] }, type: "settled" };

function run(...events: AddToPlaylistEvent[]) {
  return events.reduce(reduceAddToPlaylist, idleFlow);
}

function send(state: AddToPlaylistFlow, ...events: AddToPlaylistEvent[]) {
  return events.reduce(reduceAddToPlaylist, state);
}

it("checks the picked playlist with the whole ordered target, repeats included", () => {
  const checking = run(open, pick());

  expect(checking.phase).toBe("checking");
  expect(requestOf(checking)).toEqual({
    destination: mix,
    duplicates: "check",
    trackIds: [10, 20, 10, 30],
  });
});

it("closes and returns focus when the check adds without duplicates", () => {
  const state = run(open, pick(), added);

  expect(state).toMatchObject({ phase: "closed", returnFocus: true });
  expect(requestOf(state)).toBeNull();
});

it("asks about duplicates, then adds only the new tracks", () => {
  const confirming = run(open, pick(), duplicate(2, 2));

  expect(confirming).toMatchObject({
    destination: mix,
    duplicates: { alreadyInPlaylist: 2, newTrackCount: 2 },
    phase: "confirmingDuplicates",
  });
  expect(requestOf(confirming)).toBeNull();

  const adding = send(confirming, { mode: "skip", type: "choose" });

  expect(requestOf(adding)).toEqual({
    destination: mix,
    duplicates: "skip",
    trackIds: [10, 20, 10, 30],
  });
  expect(send(adding, added)).toMatchObject({ phase: "closed", returnFocus: true });
});

it("adds the whole target anyway when chosen", () => {
  const adding = run(open, pick(), duplicate(2, 2), { mode: "allow", type: "choose" });

  expect(requestOf(adding)).toMatchObject({ duplicates: "allow", trackIds: [10, 20, 10, 30] });
});

it("offers no add-only-new when every target is already there", () => {
  const confirming = run(open, pick(), duplicate(4, 0));

  expect(send(confirming, { mode: "skip", type: "choose" })).toBe(confirming);
  expect(requestOf(send(confirming, { mode: "allow", type: "choose" }))).toMatchObject({
    duplicates: "allow",
  });
});

it("submits each step at most once", () => {
  const checking = run(open, pick());

  expect(send(checking, pick(road))).toBe(checking);

  const adding = send(checking, duplicate(2, 2), { mode: "skip", type: "choose" });

  expect(send(adding, { mode: "allow", type: "choose" })).toBe(adding);
  expect(send(adding, { mode: "skip", type: "choose" })).toBe(adding);
});

it("cannot be dismissed while a request is in flight", () => {
  const checking = run(open, pick());
  const adding = send(checking, duplicate(2, 2), { mode: "allow", type: "choose" });

  expect(send(checking, { type: "dismiss" })).toBe(checking);
  expect(send(adding, { type: "dismiss" })).toBe(adding);
});

it("cancels the duplicate question without writing and returns focus", () => {
  const state = run(open, pick(), duplicate(2, 2), { type: "dismiss" });

  expect(state).toMatchObject({ phase: "closed", returnFocus: true });
  expect(requestOf(state)).toBeNull();
});

it("hands off to creation from the picker without returning focus", () => {
  expect(run(open, { type: "createInstead" })).toMatchObject({
    last: { phase: "picking", target },
    phase: "closed",
    returnFocus: false,
  });
  expect(run(open, pick(), { type: "createInstead" }).phase).toBe("checking");
});

it("closes the picker for the queue and returns focus without a playlist request", () => {
  const state = run(open, { type: "addToQueue" });

  expect(state).toMatchObject({
    last: { phase: "picking", returnTo: 1, target },
    phase: "closed",
    returnFocus: true,
  });
  expect(requestOf(state)).toBeNull();
  expect(run(open, pick(), { type: "addToQueue" }).phase).toBe("checking");
  expect(run({ type: "addToQueue" })).toBe(idleFlow);
});

it("shows a failed check in the picker and starts fresh on the next destination", () => {
  const failed = run(open, pick(), { message: "Playlist does not exist", type: "failed" });

  expect(failed).toMatchObject({ error: "Playlist does not exist", phase: "picking" });

  const retried = send(failed, pick(road), duplicate(1, 3));

  expect(retried).toMatchObject({
    destination: road,
    duplicates: { alreadyInPlaylist: 1, newTrackCount: 3 },
    error: null,
    phase: "confirmingDuplicates",
  });
});

it("keeps the duplicate question open after a failed add so it can be retried", () => {
  const failed = run(
    open,
    pick(),
    duplicate(2, 2),
    { mode: "skip", type: "choose" },
    {
      message: "Track does not exist",
      type: "failed",
    },
  );

  expect(failed).toMatchObject({ error: "Track does not exist", phase: "confirmingDuplicates" });
  expect(requestOf(send(failed, { mode: "allow", type: "choose" }))).toMatchObject({
    duplicates: "allow",
  });
});

it("forgets the closed flow once its exit finishes and reopens from scratch", () => {
  const closed = run(open, pick(), duplicate(2, 2), { type: "dismiss" });

  expect(send(closed, { type: "exited" })).toEqual(idleFlow);
  expect(send(closed, open)).toMatchObject({ error: null, phase: "picking" });
  expect(run(open, open)).toEqual(run(open));
});

it("describes what the add did", () => {
  const request = (duplicates: "check" | "allow" | "skip", trackIds: number[]) => ({
    destination: mix,
    duplicates,
    trackIds,
  });

  expect(describeAddition(request("check", [10]), 1)).toBe("Added to Mix");
  expect(describeAddition(request("check", [10, 20, 10, 30]), 4)).toBe("Added 4 tracks to Mix");
  expect(describeAddition(request("allow", [10, 20, 10, 30]), 4)).toBe("Added 4 tracks to Mix");
  expect(describeAddition(request("skip", [10, 20, 10, 30]), 2)).toBe("Added 2 tracks to Mix");
  expect(describeAddition(request("skip", [10, 20, 10, 30]), 1)).toBe("Added 1 track to Mix");
  expect(describeAddition(request("skip", [10, 20, 10, 30]), 0)).toBe("All 4 already in Mix");
});

it("describes how many targets are already in the playlist", () => {
  const single: ActionTarget = { context: target.context, entries: [entry(1, 10)] };

  expect(describeDuplicates({ alreadyInPlaylist: 2, newTrackCount: 2 }, target, "Mix")).toBe(
    "2 of 4 tracks are already in Mix.",
  );
  expect(describeDuplicates({ alreadyInPlaylist: 1, newTrackCount: 3 }, target, "Mix")).toBe(
    "1 of 4 tracks is already in Mix.",
  );
  expect(describeDuplicates({ alreadyInPlaylist: 4, newTrackCount: 0 }, target, "Mix")).toBe(
    "All 4 tracks are already in Mix.",
  );
  expect(describeDuplicates({ alreadyInPlaylist: 1, newTrackCount: 0 }, single, "Mix")).toBe(
    "Track 10 is already in Mix.",
  );
});
