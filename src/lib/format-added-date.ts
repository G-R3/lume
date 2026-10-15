const dayFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const dayAndYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatAddedDate(addedAt: number, now = Date.now()) {
  if (now - addedAt >= 0 && now - addedAt < 5 * 60_000) return "Just now";

  const added = new Date(addedAt);
  const today = new Date(now);
  const days = Math.round((startOfDay(today) - startOfDay(added)) / 86_400_000);

  if (days === 0) return "Today";

  if (days === 1) return "Yesterday";

  return added.getFullYear() === today.getFullYear()
    ? dayFormatter.format(added)
    : dayAndYearFormatter.format(added);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
