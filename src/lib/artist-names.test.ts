import { describe, expect, it } from "vite-plus/test";
import { artistLabel, artistNames } from "./artist-names";

describe("artistNames", () => {
  it("joins artists with a comma", () => {
    expect(artistNames(["Nina", "Ray"])).toBe("Nina, Ray");
  });

  it("is empty when the track has no artists", () => {
    expect(artistNames([])).toBe("");
  });
});

describe("artistLabel", () => {
  it("shows the joined artists", () => {
    expect(artistLabel(["Nina", "Ray"])).toBe("Nina, Ray");
  });

  it.each([
    { case: "no artists", artists: [] },
    { case: "a blank artist", artists: [""] },
    { case: "no track", artists: undefined },
  ])("falls back to Unknown artist for $case", ({ artists }) => {
    expect(artistLabel(artists)).toBe("Unknown artist");
  });
});
