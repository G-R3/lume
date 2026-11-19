export function artistNames(artists: readonly string[]) {
  return artists.join(", ");
}

export function artistLabel(artists: readonly string[] | undefined) {
  return (artists && artistNames(artists)) || "Unknown artist";
}
