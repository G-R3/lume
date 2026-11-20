export function joinArtists(artists: readonly string[]) {
  return artists.join(", ");
}

export function formatArtists(artists: readonly string[] | undefined) {
  return (artists && joinArtists(artists)) || "Unknown artist";
}
