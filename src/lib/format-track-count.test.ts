import { describe, expect, it } from "vite-plus/test";
import { formatTrackCount } from "./format-track-count";

describe("formatTrackCount", () => {
  it.each([
    { count: 0, text: "0 tracks" },
    { count: 1, text: "1 track" },
    { count: 2, text: "2 tracks" },
    { count: 1200, text: `${(1200).toLocaleString()} tracks` },
  ])("formats $count as $text", ({ count, text }) => {
    expect(formatTrackCount(count)).toBe(text);
  });
});
