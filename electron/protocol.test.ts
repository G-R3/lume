import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  getRendererAssetPath,
  getTrackPath,
  getTrackUrl,
  isTrustedRendererUrl,
} from "./protocol";

const rendererDirectory = resolve("app", "out", "renderer");
const packagedRendererUrl = "lume://app/index.html";

describe("isTrustedRendererUrl", () => {
  it("accepts the configured document URL", () => {
    expect(isTrustedRendererUrl(packagedRendererUrl, packagedRendererUrl)).toBe(
      true,
    );
    expect(
      isTrustedRendererUrl(
        "http://localhost:5173/",
        "http://localhost:5173/#library",
      ),
    ).toBe(true);
  });

  it.each([
    "https://app/index.html",
    "lume://other/index.html",
    "lume://app/settings.html",
    "not a url",
  ])("rejects an untrusted renderer URL: %s", (candidateUrl) => {
    expect(isTrustedRendererUrl(packagedRendererUrl, candidateUrl)).toBe(false);
  });

  it("rejects another development server port", () => {
    expect(
      isTrustedRendererUrl(
        "http://localhost:5173/",
        "http://localhost:5174/",
      ),
    ).toBe(false);
  });
});

describe("getRendererAssetPath", () => {
  it("maps app URLs into the renderer directory", () => {
    expect(
      getRendererAssetPath(rendererDirectory, "lume://app/"),
    ).toBe(join(rendererDirectory, "index.html"));
    expect(
      getRendererAssetPath(
        rendererDirectory,
        "lume://app/assets/application.js",
      ),
    ).toBe(join(rendererDirectory, "assets", "application.js"));
  });

  it.each([
    "https://app/index.html",
    "lume://other/index.html",
    "not a url",
    "lume://app/%",
    "lume://app/%2e%2e%2fsecrets.txt",
  ])("rejects a request outside the renderer: %s", (requestUrl) => {
    expect(
      getRendererAssetPath(rendererDirectory, requestUrl),
    ).toBeNull();
  });
});

describe("app protocol track URLs", () => {
  const trackId = "48fc51b1-f8e5-46ad-b5f6-4c4b371f9897";
  const audioPath = "/Users/listener/Music/Artist/track one.mp3";
  const tracks = new Map([[trackId, audioPath]]);

  it("resolves an indexed track through the app protocol", () => {
    const url = getTrackUrl(trackId);

    expect(url).toBe(
      "lume://app/media/48fc51b1-f8e5-46ad-b5f6-4c4b371f9897",
    );
    expect(url).not.toContain(audioPath);
    expect(getTrackPath(url, tracks)).toBe(audioPath);
  });

  it("rejects a track outside the index", () => {
    expect(
      getTrackPath("lume://app/media/unknown", tracks),
    ).toBeNull();
  });

  it.each([
    `https://app/media/${trackId}`,
    `lume://other/media/${trackId}`,
    "lume://app/media/%",
    "not a url",
  ])("rejects an invalid track URL: %s", (url) => {
    expect(getTrackPath(url, tracks)).toBeNull();
  });
});
