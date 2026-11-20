import { describe, expect, it } from "vite-plus/test";
import { formatAddedDate } from "./format-added-date";

const now = new Date(2026, 10, 11, 12, 0).getTime();

const minute = 60_000;

const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const shortDateWithYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

describe("formatAddedDate", () => {
  it.each([
    { case: "now", addedAt: now, text: "Just now" },
    { case: "4 minutes ago", addedAt: now - 4 * minute, text: "Just now" },
    { case: "5 minutes ago", addedAt: now - 5 * minute, text: "Today" },
    { case: "earlier today", addedAt: new Date(2026, 10, 11, 0, 5).getTime(), text: "Today" },
    { case: "yesterday", addedAt: new Date(2026, 10, 10, 23, 0).getTime(), text: "Yesterday" },
    { case: "a future time", addedAt: now + minute, text: "Today" },
  ])("shows $text for $case", ({ addedAt, text }) => {
    expect(formatAddedDate(addedAt, now)).toBe(text);
  });

  it("shows the day and month for an older date this year", () => {
    const addedAt = new Date(2026, 2, 4, 12, 0).getTime();

    expect(formatAddedDate(addedAt, now)).toBe(shortDate.format(addedAt));
  });

  it("adds the year for a date in another year", () => {
    const addedAt = new Date(2025, 10, 4, 12, 0).getTime();

    expect(formatAddedDate(addedAt, now)).toBe(shortDateWithYear.format(addedAt));
  });
});
