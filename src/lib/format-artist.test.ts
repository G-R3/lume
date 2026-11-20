import { describe, expect, it } from "vite-plus/test";
import { formatArtists, joinArtists } from "./format-artist";

describe("joinArtists", () => {
  it("joins artists with a comma", () => {
    expect(joinArtists(["Nina", "Ray"])).toBe("Nina, Ray");
  });

  it("is empty when the track has no artists", () => {
    expect(joinArtists([])).toBe("");
  });
});

describe("formatArtists", () => {
  it("shows the joined artists", () => {
    expect(formatArtists(["Nina", "Ray"])).toBe("Nina, Ray");
  });

  it.each([
    { case: "no artists", artists: [] },
    { case: "a blank artist", artists: [""] },
    { case: "no track", artists: undefined },
  ])("falls back to Unknown artist for $case", ({ artists }) => {
    expect(formatArtists(artists)).toBe("Unknown artist");
  });
});
