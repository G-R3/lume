export function formatDuration(duration: number | null) {
  if (duration === null || !Number.isFinite(duration) || duration < 0) {
    return "--:--";
  }

  const seconds = Math.floor(duration);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");

  if (minutes < 60) return `${minutes}:${remainingSeconds}`;

  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remainingSeconds}`;
}
