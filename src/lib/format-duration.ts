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

export function formatTotalDuration(duration: number) {
  const minutes = duration > 0 ? Math.max(1, Math.round(duration / 60)) : 0;
  const hours = Math.floor(minutes / 60);

  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;

  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;

  return `${minutes}m`;
}
