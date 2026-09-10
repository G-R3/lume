import { describe, expect, it } from "vite-plus/test";
import { formatDuration } from "./format-duration";

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
