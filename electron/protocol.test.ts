import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getArtworkUrl, getTrackUrl } from "../shared/lib";
import {
  createArtworkResponse,
  createTrackResponse,
  getRendererAssetPath,
  isTrustedRendererUrl,
  resolveArtworkRequest,
  resolveTrackRequest,
} from "./protocol";

const rendererDirectory = resolve("app", "out", "renderer");

const packagedRendererUrl = "lume://app/index.html";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

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
  it("maps app URLs into the renderer directory", () => {
    expect(getRendererAssetPath(rendererDirectory, "lume://app/")).toBe(
      join(rendererDirectory, "index.html"),
    );
    expect(getRendererAssetPath(rendererDirectory, "lume://app/assets/application.js")).toBe(
      join(rendererDirectory, "assets", "application.js"),
    );
  });

  it.each([
    { description: "the wrong protocol", requestUrl: "https://app/index.html" },
    { description: "the wrong host", requestUrl: "lume://other/index.html" },
    { description: "a malformed URL", requestUrl: "not a url" },
    { description: "malformed percent encoding", requestUrl: "lume://app/%" },
    {
      description: "an encoded parent-directory traversal",
      requestUrl: "lume://app/%2e%2e%2fsecrets.txt",
    },
  ])("rejects $description", (testCase) => {
    expect(getRendererAssetPath(rendererDirectory, testCase.requestUrl)).toBeNull();
  });
});

describe("app protocol track URLs", () => {
  const trackId = "48fc51b1-f8e5-46ad-b5f6-4c4b371f9897";
  const audioPath = "/Users/listener/Music/Artist/track one.mp3";
  const getTrackPath = (candidateId: string) => (candidateId === trackId ? audioPath : null);

  it("resolves an indexed track through the app protocol", () => {
    const url = getTrackUrl(trackId);

    expect(url).toBe("lume://app/media/48fc51b1-f8e5-46ad-b5f6-4c4b371f9897");
    expect(url).not.toContain(audioPath);
    expect(resolveTrackRequest(url, getTrackPath)).toEqual({ path: audioPath });
  });

  it("rejects a track outside the index", () => {
    expect(resolveTrackRequest("lume://app/media/unknown", getTrackPath)).toEqual({
      path: null,
    });
  });

  it("rejects a malformed track ID", () => {
    expect(resolveTrackRequest("lume://app/media/%", getTrackPath)).toEqual({
      path: null,
    });
  });

  it.each([
    { description: "the wrong protocol", url: `https://app/media/${trackId}` },
    { description: "the wrong host", url: `lume://other/media/${trackId}` },
    { description: "a malformed URL", url: "not a url" },
  ])("rejects track URLs with $description", (testCase) => {
    expect(resolveTrackRequest(testCase.url, getTrackPath)).toBeNull();
  });
});

describe("app protocol artwork URLs", () => {
  it("resolves indexed artwork without exposing database bytes in the URL", () => {
    const artwork = { data: Uint8Array.from([1, 2, 3]), mediaType: "image/png" };
    const url = getArtworkUrl("cover-id");

    expect(url).toBe("lume://app/artwork/cover-id");
    expect(resolveArtworkRequest(url, (id) => (id === "cover-id" ? artwork : null))).toEqual({
      artwork,
    });
    expect(resolveArtworkRequest("lume://app/artwork/missing", () => null)).toEqual({
      artwork: null,
    });
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
  const folder = await mkdtemp(join(tmpdir(), "lume-protocol-"));
  temporaryFolders.push(folder);
  const path = join(folder, name);
  await writeFile(
    path,
    Uint8Array.from({ length: 10 }, (_, index) => index),
  );

  return path;
}
