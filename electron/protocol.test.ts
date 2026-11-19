import { writeFile } from "node:fs/promises";
import { createTemporaryFolder } from "../tests/helpers/temp-folder";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parseAppUrl } from "@shared/app-urls";
import {
  createArtworkResponse,
  createTrackResponse,
  getRendererAssetPath,
  isTrustedRendererUrl,
} from "./protocol";

const rendererDirectory = resolve("app", "out", "renderer");

const packagedRendererUrl = "lume://app/index.html";

describe("isTrustedRendererUrl", () => {
  it("accepts the configured document URL", () => {
    expect(isTrustedRendererUrl(packagedRendererUrl, packagedRendererUrl)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/", "http://localhost:5173/#library")).toBe(
      true,
    );
  });

  it.each([
    { candidateUrl: "https://app/index.html", description: "the wrong protocol" },
    { candidateUrl: "lume://other/index.html", description: "the wrong host" },
    { candidateUrl: "lume://app/settings.html", description: "the wrong document" },
    { candidateUrl: "not a url", description: "a malformed URL" },
  ])("rejects $description", (testCase) => {
    expect(isTrustedRendererUrl(packagedRendererUrl, testCase.candidateUrl)).toBe(false);
  });

  it("rejects another development server port", () => {
    expect(isTrustedRendererUrl("http://localhost:5173/", "http://localhost:5174/")).toBe(false);
  });
});

describe("getRendererAssetPath", () => {
  const getAssetPath = (url: string) => {
    const appUrl = parseAppUrl(url);

    return getRendererAssetPath(rendererDirectory, appUrl?.kind === "asset" ? appUrl.path : null);
  };

  it("maps app URLs into the renderer directory", () => {
    expect(getAssetPath("lume://app/")).toBe(join(rendererDirectory, "index.html"));
    expect(getAssetPath("lume://app/assets/application.js")).toBe(
      join(rendererDirectory, "assets", "application.js"),
    );
  });

  it.each([
    { description: "malformed percent encoding", requestUrl: "lume://app/%" },
    {
      description: "an encoded parent-directory traversal",
      requestUrl: "lume://app/%2e%2e%2fsecrets.txt",
    },
  ])("rejects $description", (testCase) => {
    expect(getAssetPath(testCase.requestUrl)).toBeNull();
  });
});

describe("createArtworkResponse", () => {
  it("serves artwork bytes with immutable cache headers", async () => {
    const data = Uint8Array.from([1, 2, 3]);
    const response = createArtworkResponse({ data, mediaType: "image/png" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(data);
  });

  it("returns 404 when artwork is missing", () => {
    expect(createArtworkResponse(null).status).toBe(404);
  });
});

describe("createTrackResponse", () => {
  it("serves a complete audio file with media headers", async () => {
    const path = await createAudioFile("track.mp3");
    const response = await createTrackResponse(path, new Request("lume://app/media/track"));

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from({ length: 10 }, (_, index) => index),
    );
  });

  it.each([
    {
      description: "a bounded range",
      expectedBody: [2, 3, 4, 5],
      expectedContentLength: "4",
      expectedContentRange: "bytes 2-5/10",
      range: "bytes=2-5",
    },
    {
      description: "an open-ended range",
      expectedBody: [7, 8, 9],
      expectedContentLength: "3",
      expectedContentRange: "bytes 7-9/10",
      range: "bytes=7-",
    },
    {
      description: "a suffix range",
      expectedBody: [7, 8, 9],
      expectedContentLength: "3",
      expectedContentRange: "bytes 7-9/10",
      range: "bytes=-3",
    },
  ])("serves $description", async (testCase) => {
    const response = await createTrackResponse(
      await createAudioFile("track.mp3"),
      new Request("lume://app/media/track", { headers: { Range: testCase.range } }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(testCase.expectedContentRange);
    expect(response.headers.get("content-length")).toBe(testCase.expectedContentLength);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from(testCase.expectedBody),
    );
  });

  it("rejects an unsatisfiable range", async () => {
    const response = await createTrackResponse(
      await createAudioFile("track.mp3"),
      new Request("lume://app/media/track", {
        headers: { Range: "bytes=10-" },
      }),
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it("returns 404 when an indexed file no longer exists", async () => {
    const response = await createTrackResponse(
      "/missing/track.mp3",
      new Request("lume://app/media/track"),
    );

    expect(response.status).toBe(404);
  });
});

async function createAudioFile(name: string) {
  const folder = await createTemporaryFolder("lume-protocol-");
  const path = join(folder, name);
  await writeFile(
    path,
    Uint8Array.from({ length: 10 }, (_, index) => index),
  );

  return path;
}
