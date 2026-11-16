import { describe, expect, it } from "vite-plus/test";
import {
  getTrackUrl,
  type LibraryRevision,
  type LibrarySnapshot,
  type Track,
  type TracksLikedResult,
} from "../../shared/lib";
import {
  type SavedLibrary,
  type RevisedSources,
  showSavedLibrary,
  emptySavedLibrary,
  withNewerLikes,
  withNewerSnapshot,
  withNewerSources,
} from "@/lib/saved-library";

type Payload =
  | { kind: "likes"; result: TracksLikedResult }
  | { kind: "snapshot"; snapshot: LibrarySnapshot }
  | { kind: "sources"; update: RevisedSources };

const firstSnapshot = snapshot({
  revision: 1,
  scannedAt: 1,
  tracks: [track(1, null), track(2, null)],
});

const firstLikes = likes(2, [1, 100], [2, 200]);

const sourcesUpdate = sources({ revision: 3, scannedAt: 3 });

const secondSnapshot = snapshot({
  revision: 4,
  scannedAt: 4,
  tracks: [track(1, 400), track(2, null), track(3, null)],
});

const secondLikes = likes(5, [2, null], [3, 500]);

const payloads = [firstSnapshot, firstLikes, sourcesUpdate, secondSnapshot, secondLikes];

describe("the saved library", () => {
  const inRevisionOrder = shownAfter(payloads);

  it.each(permutationsOf(payloads).map((order) => [order.map(nameOf).join(", "), order] as const))(
    "shows the same library when payloads arrive as %s",
    (_name, order) => {
      expect(shownAfter(order)).toEqual(inRevisionOrder);
    },
  );

  it("keeps the newer like when a snapshot older than it but newer than another like arrives last", () => {
    const shown = shownAfter([
      firstSnapshot,
      firstLikes,
      sourcesUpdate,
      secondLikes,
      secondSnapshot,
    ]);

    expect(shown).toEqual(inRevisionOrder);
    expect(shown?.kind === "library" && shown.tracks.map((entry) => entry.likedAt)).toEqual([
      400,
      null,
      500,
    ]);
  });
});

function shownAfter(order: readonly Payload[]) {
  return showSavedLibrary(order.reduce(applied, emptySavedLibrary));
}

function applied(saved: SavedLibrary, payload: Payload) {
  switch (payload.kind) {
    case "likes":
      return withNewerLikes(saved, payload.result);
    case "snapshot":
      return withNewerSnapshot(saved, payload.snapshot);
    case "sources":
      return withNewerSources(saved, payload.update);
  }
}

function permutationsOf<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];

  return items.flatMap((item, index) =>
    permutationsOf(items.toSpliced(index, 1)).map((rest) => [item, ...rest]),
  );
}

function nameOf(payload: Payload) {
  const revision =
    payload.kind === "likes"
      ? payload.result.revision
      : payload.kind === "snapshot"
        ? payload.snapshot.revision
        : payload.update.revision;

  return `${payload.kind} ${revision}`;
}

function snapshot({
  revision,
  scannedAt,
  tracks,
}: {
  revision: LibraryRevision;
  scannedAt: number;
  tracks: Track[];
}): Payload {
  return {
    kind: "snapshot",
    snapshot: {
      kind: "library",
      playlists: [],
      revision,
      sources: sources({ revision, scannedAt }).update.sources,
      tracks,
    },
  };
}

function sources({ revision, scannedAt }: { revision: LibraryRevision; scannedAt: number }) {
  return {
    kind: "sources",
    update: {
      revision,
      sources: [
        {
          id: 1,
          path: "/music",
          status: { kind: "scanned" as const, scannedAt, trackCount: 3 },
        },
      ],
    },
  } satisfies Payload;
}

function likes(
  revision: LibraryRevision,
  ...entries: [trackId: number, likedAt: number | null][]
): Payload {
  return {
    kind: "likes",
    result: { likes: entries.map(([trackId, likedAt]) => ({ likedAt, trackId })), revision },
  };
}

function track(id: number, likedAt: number | null): Track {
  return {
    addedAt: 1,
    album: "Album",
    albumArtists: ["Artist"],
    artists: ["Artist"],
    artworkUrl: null,
    available: true,
    unavailableReason: null,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 1,
    format: "MP3",
    genres: ["Pop"],
    id,
    likedAt,
    lossless: null,
    sampleRate: null,
    title: "Song",
    trackNumber: id,
    trackTotal: null,
    url: getTrackUrl(id),
    year: null,
  };
}
