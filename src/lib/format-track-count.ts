export function formatTrackCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;
}
