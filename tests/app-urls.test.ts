import { describe, expect, it } from "vite-plus/test";
import { getArtworkUrl, getTrackUrl, PACKAGED_RENDERER_URL, parseAppUrl } from "@shared/app-urls";

describe("app URLs", () => {
  it("round-trips a track URL", () => {
    expect(parseAppUrl(getTrackUrl(42))).toEqual({ kind: "track", trackId: 42 });
  });

  it("round-trips an artwork URL", () => {
    expect(parseAppUrl(getArtworkUrl("cover-id"))).toEqual({
      kind: "artwork",
      artworkId: "cover-id",
    });
    expect(parseAppUrl(getArtworkUrl("a b/c"))).toEqual({ kind: "artwork", artworkId: "a b/c" });
  });

  it("round-trips the packaged renderer URL as an app asset", () => {
    expect(parseAppUrl(PACKAGED_RENDERER_URL)).toEqual({ kind: "asset", path: "/index.html" });
    expect(parseAppUrl("lume://app/assets/a%20b.js")).toEqual({
      kind: "asset",
      path: "/assets/a b.js",
    });
  });

  it.each(["unknown", "%", "0", "-1", "1.5", "", "9007199254740993"])(
    "rejects the track ID %j",
    (id) => {
      expect(parseAppUrl(`lume://app/media/${id}`)).toEqual({ kind: "track", trackId: null });
    },
  );

  it("rejects malformed artwork and asset encoding", () => {
    expect(parseAppUrl("lume://app/artwork/%")).toEqual({ kind: "artwork", artworkId: null });
    expect(parseAppUrl("lume://app/%")).toEqual({ kind: "asset", path: null });
  });

  it.each([
    { description: "an encoded media prefix", url: "lume://app/%6Dedia/42", path: "/media/42" },
    { description: "a media path without a slash", url: "lume://app/media", path: "/media" },
    { description: "an artwork path without a slash", url: "lume://app/artwork", path: "/artwork" },
  ])("treats $description as an app asset", (testCase) => {
    expect(parseAppUrl(testCase.url)).toEqual({ kind: "asset", path: testCase.path });
  });

  it.each([
    { description: "the wrong protocol", url: "https://app/media/42" },
    { description: "the wrong host", url: "lume://other/media/42" },
    { description: "the wrong host for artwork", url: "lume://other/artwork/cover-id" },
    { description: "the wrong host for assets", url: "lume://other/index.html" },
    { description: "a malformed URL", url: "not a url" },
  ])("rejects $description", (testCase) => {
    expect(parseAppUrl(testCase.url)).toBeNull();
  });
});
