import type {
  PlaylistDetails,
  PlaylistEvent,
  PlaylistRead,
  PlaylistSummary,
} from "../../shared/library";
import type { QueueCommand } from "./queue/commands";

export type PlaylistSourceChange = Extract<
  QueueCommand,
  { type: "sourceEntriesAdded" | "sourceEntriesRemoved" | "sourceDeleted" }
>;

export type PlaylistEffects = {
  playlistId: number;
  summaries: (summaries: readonly PlaylistSummary[]) => PlaylistSummary[];
  nextRead: (held: PlaylistRead | undefined) => PlaylistRead | undefined;
  sourceChange: PlaylistSourceChange | null;
};

type EffectsOf = {
  [Kind in PlaylistEvent["kind"]]: (
    event: Extract<PlaylistEvent, { kind: Kind }>,
  ) => PlaylistEffects;
};

const effectsOf: EffectsOf = {
  "playlist-created": ({ playlist, revision }) => ({
    playlistId: playlist.id,
    summaries: (summaries) => [...summaries, summaryOf(playlist)],
    nextRead: replaceRead(revision, playlist),
    sourceChange: null,
  }),
  "playlist-deleted": ({ playlistId, revision }) => ({
    playlistId,
    summaries: (summaries) => summaries.filter((summary) => summary.id !== playlistId),
    nextRead: replaceRead(revision, null),
    sourceChange: { type: "sourceDeleted", playlistId },
  }),
  "playlist-tracks-added": ({ playlistId, revision, trackCount, tracks }) => {
    const addedIds = new Set(tracks.map((track) => track.id));

    return {
      playlistId,
      summaries: withTrackCount(playlistId, trackCount),
      nextRead: patchRead(revision, (playlist) => ({
        ...playlist,
        tracks: [...playlist.tracks.filter((entry) => !addedIds.has(entry.id)), ...tracks].sort(
          (left, right) => left.position - right.position,
        ),
      })),
      sourceChange:
        tracks.length === 0
          ? null
          : {
              type: "sourceEntriesAdded",
              playlistId,
              entries: tracks.map((track) => ({ sourceEntryId: track.id, trackId: track.trackId })),
            },
    };
  },
  "playlist-tracks-removed": ({ playlistId, playlistTrackIds, revision, trackCount }) => {
    const removedIds = new Set(playlistTrackIds);

    return {
      playlistId,
      summaries: withTrackCount(playlistId, trackCount),
      nextRead: patchRead(revision, (playlist) => ({
        ...playlist,
        tracks: playlist.tracks.filter((entry) => !removedIds.has(entry.id)),
      })),
      sourceChange: { type: "sourceEntriesRemoved", playlistId, sourceEntryIds: playlistTrackIds },
    };
  },
};

export function playlistEffects<Kind extends PlaylistEvent["kind"]>(
  event: Extract<PlaylistEvent, { kind: Kind }>,
): PlaylistEffects {
  const effects: EffectsOf[Kind] = effectsOf[event.kind];

  return effects(event);
}

function summaryOf({ description, id, title, tracks }: PlaylistDetails): PlaylistSummary {
  return { description, id, title, trackCount: tracks.length };
}

function withTrackCount(playlistId: number, trackCount: number) {
  return (summaries: readonly PlaylistSummary[]) =>
    summaries.map((summary) => (summary.id === playlistId ? { ...summary, trackCount } : summary));
}

function replaceRead(revision: number, playlist: PlaylistDetails | null) {
  return (held: PlaylistRead | undefined): PlaylistRead =>
    held && held.revision >= revision ? held : { revision, playlist };
}

function patchRead(revision: number, patch: (playlist: PlaylistDetails) => PlaylistDetails) {
  return (held: PlaylistRead | undefined): PlaylistRead | undefined => {
    if (!held || held.revision >= revision) return held;

    return { revision, playlist: held.playlist && patch(held.playlist) };
  };
}
