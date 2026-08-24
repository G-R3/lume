import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  getRendererAssetPath,
  getRendererUrl,
  isTrustedRendererUrl,
} from "./renderer";

const rendererDirectory = resolve("app", "out", "renderer");
const packagedRendererUrl = "lume://app/index.html";

describe("getRendererUrl", () => {
  it("uses the development server only in development", () => {
    expect(getRendererUrl(false, "http://localhost:5173/")).toBe(
      "http://localhost:5173/",
    );
    expect(getRendererUrl(true, "https://attacker.example/")).toBe(
      packagedRendererUrl,
    );
    expect(getRendererUrl(false, undefined)).toBe(packagedRendererUrl);
  });
});

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
    expect(getRendererAssetPath(rendererDirectory, "lume://app/")).toBe(
      join(rendererDirectory, "index.html"),
    );
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
    expect(getRendererAssetPath(rendererDirectory, requestUrl)).toBeNull();
  });
});
