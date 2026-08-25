import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createTrackResponse,
  getRendererAssetPath,
  getTrackUrl,
  isTrustedRendererUrl,
  resolveTrackRequest,
} from "./protocol";

const rendererDirectory = resolve("app", "out", "renderer");
const packagedRendererUrl = "lume://app/index.html";
const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) =>
      rm(folder, { force: true, recursive: true }),
    ),
  );
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
    expect(resolveTrackRequest(url, tracks)).toEqual({ path: audioPath });
  });

  it("rejects a track outside the index", () => {
    expect(resolveTrackRequest("lume://app/media/unknown", tracks)).toEqual({
      path: null,
    });
  });

  it("rejects a malformed track ID", () => {
    expect(resolveTrackRequest("lume://app/media/%", tracks)).toEqual({
      path: null,
    });
  });

  it.each([
    `https://app/media/${trackId}`,
    `lume://other/media/${trackId}`,
    "not a url",
  ])("rejects an invalid track URL: %s", (url) => {
    expect(resolveTrackRequest(url, tracks)).toBeNull();
  });
});

describe("createTrackResponse", () => {
  it("serves a complete audio file with media headers", async () => {
    const path = await createAudioFile("track.mp3");
    const response = await createTrackResponse(
      path,
      new Request("lume://app/media/track"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from({ length: 10 }, (_, index) => index),
    );
  });

  it.each([
    ["bytes=2-5", "bytes 2-5/10", [2, 3, 4, 5]],
    ["bytes=7-", "bytes 7-9/10", [7, 8, 9]],
    ["bytes=-3", "bytes 7-9/10", [7, 8, 9]],
  ])("serves the requested range: %s", async (range, contentRange, body) => {
    const response = await createTrackResponse(
      await createAudioFile("track.mp3"),
      new Request("lume://app/media/track", { headers: { Range: range } }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(contentRange);
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from(body),
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
