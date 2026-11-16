import type { MusicLibrary, Track } from "../../shared/lib";

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
