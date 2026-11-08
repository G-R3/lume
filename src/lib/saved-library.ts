import type {
  FirstRunLibrary,
  LibraryRevision,
  LibrarySnapshot,
  MusicLibrary,
  Track,
  TracksLikedResult,
} from "../../shared/lib";

export type SavedLibrary = {
  likes: ReadonlyMap<Track["id"], SavedLike>;
  snapshot: LibrarySnapshot | null;
  sources: RevisedSources | null;
};

export type RevisedSources = { revision: LibraryRevision; sources: MusicLibrary["sources"] };

type SavedLike = { likedAt: Track["likedAt"]; revision: LibraryRevision };

export type ShownLibrary = MusicLibrary | FirstRunLibrary;

export const emptySavedLibrary: SavedLibrary = {
  likes: new Map(),
  snapshot: null,
  sources: null,
};

export function withNewerSnapshot(
  saved = emptySavedLibrary,
  snapshot: LibrarySnapshot,
): SavedLibrary {
  if (snapshot.revision <= revisionOf(saved.snapshot)) return saved;

  const isNewerThanSnapshot = (part: { revision: LibraryRevision }) =>
    part.revision > snapshot.revision;

  return {
    likes: new Map([...saved.likes].filter(([, like]) => isNewerThanSnapshot(like))),
    snapshot,
    sources: saved.sources && isNewerThanSnapshot(saved.sources) ? saved.sources : null,
  };
}

export function withNewerSources(saved = emptySavedLibrary, update: RevisedSources): SavedLibrary {
  const newestSources = saved.sources ?? saved.snapshot;

  return update.revision > revisionOf(newestSources) ? { ...saved, sources: update } : saved;
}

export function withNewerLikes(saved: SavedLibrary, result: TracksLikedResult): SavedLibrary {
  const likes = new Map(saved.likes);
  let changed = false;

  for (const { likedAt, trackId } of result.likes) {
    if (result.revision <= revisionOf(likes.get(trackId) ?? saved.snapshot)) continue;

    likes.set(trackId, { likedAt, revision: result.revision });
    changed = true;
  }

  return changed ? { ...saved, likes } : saved;
}

function revisionOf(part: { revision: LibraryRevision } | null) {
  return part?.revision ?? -Infinity;
}

export function showSavedLibrary({
  likes,
  snapshot,
  sources,
}: SavedLibrary): ShownLibrary | undefined {
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
