const dayMonthFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const dayMonthYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDayMonth(at: number) {
  return dayMonthFormatter.format(at);
}

export function formatShortDate(at: number, now: number) {
  return new Date(at).getFullYear() === new Date(now).getFullYear()
    ? dayMonthFormatter.format(at)
    : dayMonthYearFormatter.format(at);
}
