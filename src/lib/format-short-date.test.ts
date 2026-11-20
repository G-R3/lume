import { describe, expect, it } from "vite-plus/test";
import { formatDayMonth, formatShortDate } from "./format-short-date";

const now = new Date(2026, 10, 11, 12, 0).getTime();

const thisYear = new Date(2026, 0, 2, 9, 0).getTime();

const lastYear = new Date(2025, 11, 31, 9, 0).getTime();

const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const shortDateWithYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

describe("formatShortDate", () => {
  it("leaves out the year for a date in the current year", () => {
    expect(formatShortDate(thisYear, now)).toBe(shortDate.format(thisYear));
  });

  it("includes the year for a date in another year", () => {
    expect(formatShortDate(lastYear, now)).toBe(shortDateWithYear.format(lastYear));
  });
});

describe("formatDayMonth", () => {
  it("never includes the year", () => {
    expect(formatDayMonth(lastYear)).toBe(shortDate.format(lastYear));
  });
});
