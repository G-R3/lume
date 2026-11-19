import { describe, expect, it } from "vite-plus/test";
import { formatDuration, formatTotalDuration } from "./format-duration";

describe("formatDuration", () => {
  it.each([
    { duration: 0, formattedDuration: "0:00" },
    { duration: 65.9, formattedDuration: "1:05" },
    { duration: 3_723, formattedDuration: "1:02:03" },
  ])("formats $duration seconds as $formattedDuration", (testCase) => {
    expect(formatDuration(testCase.duration)).toBe(testCase.formattedDuration);
  });

  it.each([
    { description: "a missing duration", duration: null },
    { description: "NaN", duration: Number.NaN },
    { description: "an infinite duration", duration: Number.POSITIVE_INFINITY },
    { description: "a negative duration", duration: -1 },
  ])("uses a placeholder for $description", (testCase) => {
    expect(formatDuration(testCase.duration)).toBe("--:--");
  });
});

describe("formatTotalDuration", () => {
  it.each([
    { case: "no tracks", durations: [], text: "0m" },
    { case: "under a minute", durations: [5], text: "1m" },
    { case: "missing durations", durations: [65, null, 65], text: "2m" },
    { case: "over an hour", durations: [3_600, 125], text: "1h 02m" },
    { case: "over a day", durations: [90_000], text: "1d 1h" },
  ])("sums $case", ({ durations, text }) => {
    expect(formatTotalDuration(durations.map((duration) => ({ duration })))).toBe(text);
  });
});
