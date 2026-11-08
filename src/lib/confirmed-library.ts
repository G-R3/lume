import type {
  FirstRunLibrary,
  LibraryRevision,
  LibrarySnapshot,
  MusicLibrary,
  Track,
  TracksLikedResult,
} from "../../shared/lib";

export type ConfirmedLibrary = {
  likes: ReadonlyMap<Track["id"], ConfirmedLike>;
  snapshot: LibrarySnapshot | null;
  sources: RevisedSources | null;
};

export type RevisedSources = { revision: LibraryRevision; sources: MusicLibrary["sources"] };

type ConfirmedLike = { likedAt: Track["likedAt"]; revision: LibraryRevision };

export type ShownLibrary = MusicLibrary | FirstRunLibrary;

export const unconfirmedLibrary: ConfirmedLibrary = {
  likes: new Map(),
  snapshot: null,
  sources: null,
};

export function withNewerSnapshot(
  confirmed = unconfirmedLibrary,
  snapshot: LibrarySnapshot,
): ConfirmedLibrary {
  if (snapshot.revision <= revisionOf(confirmed.snapshot)) return confirmed;

  const isNewerThanSnapshot = (part: { revision: LibraryRevision }) =>
    part.revision > snapshot.revision;

  return {
    likes: new Map([...confirmed.likes].filter(([, like]) => isNewerThanSnapshot(like))),
    snapshot,
    sources: confirmed.sources && isNewerThanSnapshot(confirmed.sources) ? confirmed.sources : null,
  };
}

export function withNewerSources(
  confirmed = unconfirmedLibrary,
  update: RevisedSources,
): ConfirmedLibrary {
  const newestSources = confirmed.sources ?? confirmed.snapshot;

  return update.revision > revisionOf(newestSources)
    ? { ...confirmed, sources: update }
    : confirmed;
}

export function withNewerLikes(
  confirmed: ConfirmedLibrary,
  result: TracksLikedResult,
): ConfirmedLibrary {
  const likes = new Map(confirmed.likes);
  let changed = false;

  for (const { likedAt, trackId } of result.likes) {
    if (result.revision <= revisionOf(likes.get(trackId) ?? confirmed.snapshot)) continue;

    likes.set(trackId, { likedAt, revision: result.revision });
    changed = true;
  }

  return changed ? { ...confirmed, likes } : confirmed;
}

function revisionOf(part: { revision: LibraryRevision } | null) {
  return part?.revision ?? -Infinity;
}

export function showConfirmedLibrary({
  likes,
  snapshot,
  sources,
}: ConfirmedLibrary): ShownLibrary | undefined {
  if (snapshot?.kind !== "library") return snapshot ?? undefined;

  const library = sources ? { ...snapshot, sources: sources.sources } : snapshot;

  if (likes.size === 0) return library;

  return withLikedAt(library, (track) => {
    const like = likes.get(track.id);

    return like ? like.likedAt : track.likedAt;
  });
}

const lastProjections = new WeakMap<Track, Track>();

export function withLikedAt(
  library: MusicLibrary,
  likedAtOf: (track: Track) => Track["likedAt"],
): MusicLibrary {
  let changed = false;

  const tracks = library.tracks.map((track) => {
    const likedAt = likedAtOf(track);

    if (likedAt === track.likedAt) return track;

    changed = true;

    const lastProjection = lastProjections.get(track);

    if (lastProjection?.likedAt === likedAt) return lastProjection;

    const projection = { ...track, likedAt };
    lastProjections.set(track, projection);

    return projection;
  });

  return changed ? { ...library, tracks } : library;
}
