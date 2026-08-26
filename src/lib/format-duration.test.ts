import { describe, expect, it } from "vite-plus/test";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [65.9, "1:05"],
    [3_723, "1:02:03"],
  ])("formats %s seconds as %s", (duration, expected) => {
    expect(formatDuration(duration)).toBe(expected);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "uses a placeholder for %s",
    (duration) => {
      expect(formatDuration(duration)).toBe("--:--");
    },
  );
});
